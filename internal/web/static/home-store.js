/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Per-file guest authority. Only migration reads a serialized home. */
(function () {
    'use strict';
    var DATABASE='yavc-vfs', LEGACY='pc-terminal-home', ready=null, policy=null;
    var defaults=Object.freeze({file:100*1024*1024,home:1024*1024*1024,text:10*1024*1024,entries:100000});
    function limits(value){
        value=value||{};var out={};
        Object.keys(defaults).forEach(function(key){var n=value[key]===undefined?defaults[key]:value[key];if(!Number.isSafeInteger(n)||n<1||n>Number.MAX_SAFE_INTEGER/4||key!=='home'&&n>defaults[key])throw new Error('Invalid guest storage policy.');out[key]=n;});
        if(out.text>out.file)throw new Error('The editable source limit exceeds the file limit.');return Object.freeze(out);
    }
    function validPath(path){return typeof path==='string'&&path.length<=4096&&path[0]==='/'&&path!=='/'&&!path.split('/').slice(1).some(function(part){return !part||part==='.'||part==='..'||/[\x00-\x1f\x7f]/.test(part);});}
    function parse(value){
        if(typeof value==='string')value=JSON.parse(value);
        if(!value||typeof value!=='object'||Array.isArray(value)||!value.files||typeof value.files!=='object'||Array.isArray(value.files))throw new Error('The saved home record is invalid. Its original has been retained.');
        var out=structuredClone(value),count=0;
        Object.keys(out.files).forEach(function(path){
            var entry=out.files[path];if(++count>policy.entries||!validPath(path)||!entry||!['d','f','b'].includes(entry.t))throw new Error('The saved home contains an invalid path or entry.');
            if(entry.t==='f'&&typeof entry.c!=='string'&&(!entry.id||!Number.isSafeInteger(entry.s)))throw new Error('The saved home contains invalid text.');
            if(entry.t==='b'&&(typeof entry.id!=='string'||!entry.id||!Number.isSafeInteger(entry.s)||entry.s<0))throw new Error('The saved home contains invalid file bytes.');
            var parts=path.split('/');parts.pop();while(parts.length>1){var parent=out.files[parts.join('/')];if(parent&&parent.t!=='d')throw new Error('A saved file is used as a directory.');parts.pop();}
        });return out;
    }
    function textBlob(text){
        for(var i=0;i<text.length;i++){var c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){var next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw new Error('The saved text contains an isolated surrogate.');}else if(c>=0xdc00&&c<=0xdfff)throw new Error('The saved text contains an isolated surrogate.');}
        return new Blob([text],{type:'text/plain;charset=utf-8'});
    }
    function open(){
        if(!ready){ready=new Promise(function(resolve,reject){
            if(!window.indexedDB){reject(new Error('This browser cannot open the guest file database.'));return;}
            var request=indexedDB.open(DATABASE,1),blocked=false;
            request.onupgradeneeded=function(){['state','entries','contents'].forEach(function(name){request.result.createObjectStore(name);});};
            request.onerror=function(){reject(request.error);};request.onblocked=function(){blocked=true;reject(new Error('Close older tabs blocking the guest file database, then reload.'));};
            request.onsuccess=function(){var db=request.result;if(blocked){db.close();return;}db.onversionchange=function(){db.close();ready=null;};resolve(db);};
        });ready.catch(function(){ready=null;});}return ready;
    }
    function transaction(mode,operation){
        return open().then(function(db){return new Promise(function(resolve,reject){
            var tx=db.transaction(['state','entries','contents'],mode),state=tx.objectStore('state'),entries=tx.objectStore('entries'),contents=tx.objectStore('contents'),record,keys,values,result,failure,left=3;
            function fail(error){failure=error;tx.abort();}
            function received(){if(--left)return;try{var files=Object.create(null);keys.forEach(function(key,i){files[key]=values[i];});result=operation(record?Object.assign({},record,{data:{seeds:record.seeds||{},files:files}}):null,{state:state,entries:entries,contents:contents,fail:fail});}catch(error){fail(error);}}
            var a=state.get('home'),b=entries.getAllKeys(),c=entries.getAll();
            a.onsuccess=function(){record=a.result;received();};b.onsuccess=function(){keys=b.result;received();};c.onsuccess=function(){values=c.result;received();};
            tx.oncomplete=function(){resolve(result);};tx.onabort=tx.onerror=function(event){reject(failure||tx.error||event.target.error||new Error('The guest file transaction failed.'));};
        });});
    }
    function validate(record){if(!record||record.version!==2||!Number.isSafeInteger(record.generation)||record.generation<1||!Number.isSafeInteger(record.used)||record.used<0)throw new Error('The guest file database has an unsupported record.');return record;}
    function signature(entry){var value=Object.assign({},entry);delete value.revision;return JSON.stringify(value);}
    async function prepare(data,addition){
        data=parse(data);var payloads=new Map();
        if(addition){var bytes=addition.bytes;if(typeof addition.id!=='string'||!addition.id||!(bytes instanceof Uint8Array)&&!(bytes instanceof ArrayBuffer))throw new Error('Invalid atomic file bytes.');payloads.set(addition.id,new Blob([bytes]));}
        Object.keys(data.files).forEach(function(path){var entry=data.files[path];
            if(entry.t==='f'&&typeof entry.c==='string'){var blob=textBlob(entry.c);delete entry.c;entry.id=crypto.randomUUID();entry.s=blob.size;payloads.set(entry.id,blob);}
            if(entry.t!=='d'&&(typeof entry.id!=='string'||!entry.id||entry.id.length>255||!Number.isSafeInteger(entry.s)||entry.s<0||entry.s>policy.file))throw new Error('A file exceeds the '+Math.floor(policy.file/1048576)+' MiB storage limit.');
        });await Promise.all(Array.from(payloads,async function(pair){payloads.set(pair[0],await pair[1].arrayBuffer());}));return {data:data,payloads:payloads};
    }
    function apply(record,prepared,stores,current){
        var data=prepared.data,prior=record?record.data.files:{},known=new Map(),used=0,refs=new Set(),changed=false;
        if(Object.keys(data.files).length>policy.entries)throw new Error('The home directory entry limit was reached.');
        Object.values(prior).forEach(function(entry){if(entry.id)known.set(entry.id,entry.s);});
        Object.keys(data.files).forEach(function(path){var entry=data.files[path],old=prior[path];entry.revision=old&&signature(old)===signature(entry)?old.revision:crypto.randomUUID();
            if(entry.t!=='d'){used+=entry.s;refs.add(entry.id);var bytes=prepared.payloads.get(entry.id);if(bytes?bytes.byteLength!==entry.s:known.get(entry.id)!==entry.s)throw new Error('A saved file is missing or incomplete. The original home has been retained.');}
            if(!old||signature(old)!==signature(entry))changed=true;
        });
        if(used>policy.home)throw new Error('Your home directory is full (the limit is '+Math.floor(policy.home/1048576)+' MiB of file contents).');
        if(!record||JSON.stringify(data.seeds||{})!==JSON.stringify(record.seeds||{})||Object.keys(prior).length!==Object.keys(data.files).length)changed=true;
        if(current&&!current())throw new Error('The operation was cancelled before saving.');
        if(!changed)return record;
        var next=Object.assign({},record||{version:2,generation:0,oldGeneration:null},{used:used,seeds:data.seeds||{},generation:record?record.generation:0,data:data});
        if(next.generation===Number.MAX_SAFE_INTEGER)throw new Error('The guest file generation limit was reached.');next.generation++;
        Object.keys(prior).forEach(function(path){if(!Object.hasOwn(data.files,path))stores.entries.delete(path);});
        Object.keys(data.files).forEach(function(path){var entry=data.files[path];if(!prior[path]||entry.revision!==prior[path].revision)stores.entries.put(entry,path);});
        prepared.payloads.forEach(function(blob,id){if(refs.has(id))stores.contents.add(blob,id);});
        Object.values(prior).forEach(function(entry){if(entry.id&&!refs.has(entry.id))stores.contents.delete(entry.id);});
        var header=Object.assign({},next);delete header.data;stores.state.put(header,'home');return next;
    }
    function read(){return transaction('readonly',function(record){return validate(record);});}
    async function commit(expected,data,current,addition){var prepared=await prepare(data,addition);return transaction('readwrite',function(record,stores){validate(record);if(record.generation!==expected)throw new Error('Files changed in another tab. Your operation was not saved; retry against the current files.');return apply(record,prepared,stores,current);});}
    /* The bytes are copied at the call, before the first await, because the caller may reuse its array as soon as the call returns a
       promise. The copy is made without the array's own slice, which a subclass may answer with a view of the same memory. */
    function owned(addition){
        if(!addition)return addition;var bytes=addition.bytes,view=bytes instanceof Uint8Array?bytes:bytes instanceof ArrayBuffer?new Uint8Array(bytes):null;
        if(!view)return addition;var copy=new Uint8Array(view.byteLength);copy.set(view);return Object.assign({},addition,{bytes:copy});
    }
    async function update(change,addition){addition=owned(addition);var before=await read(),data=await change(before);return commit(before.generation,data,null,addition);}
    function oldDatabase(name){return new Promise(function(resolve,reject){var request=indexedDB.open(name);request.onupgradeneeded=function(){request.transaction.abort();};request.onerror=function(){if(request.error&&request.error.name==='AbortError')resolve(null);else reject(request.error);};request.onsuccess=function(){resolve(request.result);};});}
    async function oldHome(){var db=await oldDatabase('yavc-home');if(!db)return null;try{return await new Promise(function(resolve,reject){var tx=db.transaction('state','readonly'),r=tx.objectStore('state').get('home');tx.oncomplete=function(){resolve(r.result||null);};tx.onabort=tx.onerror=function(){reject(tx.error);};});}finally{db.close();}}
    async function initialize(options){
        policy=policy||limits(options);var existing=await transaction('readonly',function(record){return record;});if(existing)return validate(existing);
        var previous=await oldHome(),legacy=localStorage.getItem(LEGACY);
        if(previous&&(previous.version!==1||typeof previous.raw!=='string'))throw new Error('The older home database has an unsupported record.');
        var data=parse(previous?previous.raw:legacy==null?{files:{}}:legacy),prepared=await prepare(data),pictures=Object.values(data.files).filter(function(entry){return entry.t==='b';});
        if(pictures.length){var db=await oldDatabase(previous?'yavc-home':'yavc-home-blobs');if(!db)throw new Error('The original picture database is unavailable. The original home has been retained.');
            try{await new Promise(function(resolve,reject){var tx=db.transaction('blobs','readonly'),failure;
                pictures.forEach(function(entry){var request=tx.objectStore('blobs').get(entry.id);request.onsuccess=function(){var bytes=request.result;if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==entry.s){failure=new Error('A saved picture is missing or incomplete. The original home has been retained.');tx.abort();return;}prepared.payloads.set(entry.id,bytes);};});tx.oncomplete=resolve;tx.onabort=tx.onerror=function(){reject(failure||tx.error);};
            });}finally{db.close();}}
        return transaction('readwrite',function(current,stores){if(current)return validate(current);var record=apply(null,prepared,stores);record.oldGeneration=previous?previous.generation:null;stores.state.add({source:previous?previous.migrationSource:legacy},'migration');var header=Object.assign({},record);delete header.data;stores.state.put(header,'home');return record;});
    }
    function file(path){
        if(!validPath(path))return Promise.reject(new Error('Invalid file path.'));
        return open().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction(['entries','contents'],'readonly'),entry,blob,failure;var request=tx.objectStore('entries').get(path);
            request.onsuccess=function(){entry=request.result;if(!entry||entry.t==='d'){failure=new Error('The file does not exist.');tx.abort();return;}var content=tx.objectStore('contents').get(entry.id);content.onsuccess=function(){var bytes=content.result;if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==entry.s){failure=new Error('The saved file is unavailable or incomplete.');tx.abort();return;}blob=new Blob([bytes]);};};tx.oncomplete=function(){resolve({entry:entry,blob:blob});};tx.onabort=tx.onerror=function(){reject(failure||tx.error);};
        });});
    }
    async function put(path,blob,type,expected,current){
        if(!validPath(path)||!(blob instanceof Blob)||blob.size>policy.file||!type||!['f','b'].includes(type.t))throw new Error('The file exceeds its storage limit or has invalid metadata.');
        var same=false,prior=null;
        if(expected!==null){prior=await file(path);if(prior.entry.revision!==expected)throw new Error('The file changed or was deleted. Your text was not saved.');
            if(prior.entry.t===type.t&&prior.blob.size===blob.size){var bytes=await Promise.all([prior.blob.arrayBuffer(),blob.arrayBuffer()]);var a=new Uint8Array(bytes[0]),b=new Uint8Array(bytes[1]);same=a.every(function(value,i){return value===b[i];})&&(prior.entry.y||'')===(type.y||'');}}
        var id=crypto.randomUUID(),payload=same?null:await blob.arrayBuffer();return transaction('readwrite',function(record,stores){validate(record);var data=parse(record.data),old=data.files[path],parent=path.slice(0,path.lastIndexOf('/'));
            if(expected===null?!!old:!old||old.revision!==expected)throw new Error(expected===null?'The destination already exists.':'The file changed or was deleted. Your text was not saved.');
            if(parent&&(!data.files[parent]||data.files[parent].t!=='d')&&!Object.keys(data.files).some(function(key){return key.startsWith(parent+'/');}))throw new Error('The destination folder no longer exists.');
            if(!same)data.files[path]=Object.assign({},type,{id:id,s:blob.size,m:Date.now()});var payloads=new Map();if(!same)payloads.set(id,payload);return apply(record,{data:data,payloads:payloads},stores,current);
        });
    }
    async function legacyStatus(record){
        var original=await open().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction('state','readonly'),request=tx.objectStore('state').get('migration');tx.oncomplete=function(){resolve(request.result);};tx.onabort=tx.onerror=function(){reject(tx.error);};});});
        if(!original)throw new Error('The migration provenance is unavailable.');var old=await oldHome(),legacy=localStorage.getItem(LEGACY);return {changed:legacy!==original.source||(old?old.generation:null)!==record.oldGeneration,original:original.source,current:legacy,olderDatabase:old};
    }
    function blobGet(id){return open().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction('contents','readonly'),r=tx.objectStore('contents').get(id);tx.oncomplete=function(){resolve(r.result);};tx.onabort=tx.onerror=function(){reject(tx.error);};});});}
    function text(snapshot){return snapshot.blob.arrayBuffer().then(function(bytes){return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);});}
    window.yavcHomeStore=Object.freeze({initialize:initialize,read:read,update:update,commit:commit,parse:parse,file:file,put:put,text:text,legacyStatus:legacyStatus,database:DATABASE,limits:function(){return policy;},blobGet:blobGet});
})();
