/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* This fixture is the storage authority; no yavc server or browser FS is used. */
(function () {
    'use strict';
    var records=new Map([
        ['memory:first.d2',{text:'a: First\nb: Second\na -> b\n',revision:1}],
        ['memory:second.canvas',{text:JSON.stringify({nodes:[{id:'a',type:'text',x:0,y:0,width:160,height:80,text:'Canvas'}],edges:[],unknownFixture:{preserve:true}}),revision:1}]
    ]);
    var writes=[], pause=null, options=new URLSearchParams(location.search), readPause=null;
    if(options.has('readonly')){records.get('memory:first.d2').readOnly=true;records.get('memory:second.canvas').readOnly=true;}
    if(options.has('resourceRecovery')){
        var persisted=sessionStorage.getItem('fixture:resources');if(persisted)records=new Map(JSON.parse(persisted));
        document.querySelector('#two').remove();
    }
    window.fixture={records:records,writes:writes,hold:function(){pause={};pause.promise=new Promise(function(resolve){pause.release=resolve;});},release:function(){var held=pause;pause=null;held.release();}};
    fixture.persist=function(){sessionStorage.setItem('fixture:resources',JSON.stringify(Array.from(records)));};
    if(options.has('holdRead'))readPause=new Promise(function(resolve){fixture.releaseRead=resolve;});
    window.pudlHost=pudlHostKit.host({
        pages:'/different-application/', pudl:new URL('../pudl/',location.href).href, identity:function(){return [];},
        contentResources:{version:1,
            read:async function(request){if(readPause&&request.resource==='memory:first.d2'){fixture.readPending=true;await readPause;}var record=records.get(request.resource);if(!record)throw new Error('Resource not found');return {resource:request.resource,text:record.text,revision:String(record.revision),writable:!record.readOnly,name:record.name};},
            write:async function(request){
                writes.push({...request}); if(pause)await pause.promise;
                var record=records.get(request.resource);if(!record||String(record.revision)!==request.expectedRevision)throw new Error('Conflict: the resource changed.');if(record.readOnly)throw new Error('Read-only resource');
                record.text=request.text;record.revision++;if(fixture.revokeOnWrite){record.readOnly=true;fixture.revokeOnWrite=false;}if(options.has('resourceRecovery'))fixture.persist();
                return {resource:request.resource,revision:String(record.revision),writable:!record.readOnly};
            }
        }
    });
    if(options.has('creation')){
        fixture.copies=[];
        pudlHost.contentResources.create=async function(request){if(records.has(request.resource))throw new Error('Already exists');records.set(request.resource,{text:request.text,revision:1,name:'Created.d2'});fixture.persist();return {resource:request.resource,revision:'1',name:'Created.d2',writable:true};};
        pudlHost.contentResources.saveAs=async function(request,context){
            var plan=fixture.nextCopy;fixture.copies.push({...request});if(!plan)return null;plan={...plan};if(pause)await pause.promise;
            if(context&&context.signal&&context.signal.aborted)return null;
            var prior=records.get(plan.resource);
            if(prior?String(prior.revision)!==plan.expectedRevision:plan.expectedRevision!==null)throw new Error('Destination conflict');
            var revision=prior?prior.revision+1:1;records.set(plan.resource,{text:request.text,revision:revision,name:plan.name});fixture.persist();sessionStorage.setItem('fixture:selected',plan.resource);
            return {resource:plan.resource,revision:String(revision),name:plan.name,writable:true};
        };
    }
    if(options.has('withRecovery')){
        fixture.snapshotJoins=0;
        pudlHost.snapshot={join:function(){fixture.snapshotJoins++;throw new Error('Legacy recovery must not be joined.');}};
    }
    function fileServices(){return {files:{read:async function(resource){var record=records.get(resource);if(!record)throw new Error('Resource not found');return record.text;}}};}
    pudlActions.capability('files.read',fileServices);pudlActions.capability('files.write',fileServices);
    document.addEventListener('pudl:applet-state',function(e){e.detail.state='file='+encodeURIComponent(options.has('creation')&&sessionStorage.getItem('fixture:selected')||e.target.dataset.resource)+'&view=split';});
    var ready=options.has('resourceRecovery')?yavcUtil.loadGlobal(new URL('../support/snapshot.js',location.href).href,'yavcSnapshot').then(function(api){
        pudlHost.snapshot={version:2,join:function(root,take,options){fixture.recovery=api.join(root,take,options);return fixture.recovery;}};
    }):Promise.resolve();
    ready.then(function(){return pudlHostKit.install(new URL('../content/diagrams/applet.json',location.href).href);}).catch(function(err){document.body.textContent=err.message;});
})();
