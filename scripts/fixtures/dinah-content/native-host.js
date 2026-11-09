/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Acceptance fixture only. Dinah's native services retain storage authority. */
(async function(){
    'use strict';
    var A=window.go.main.App,C=window.nativeProofConfig,records=new Map(),writes=[],listeners=new Set(),leaves=new Set(),ui=await A.ReadUIState(),persisted=JSON.stringify(ui),generation=0,savedGeneration=0,writer=null,failure=null;
    if(!C||!C.workspace||!/^[a-f0-9]{64}$/.test(C.digest))throw new Error('Missing native proof configuration.');
    var state=await A.SetWorkspace(C.workspace),workspace=state.workspaceRecords.find(function(record){return record.executionPath.replace(/\\/g,'/')===C.workspace.replace(/\\/g,'/');});
    if(!workspace)throw new Error('The synthetic native workspace was not selected.');
    var source=workspace.sources.find(function(item){return item.id===workspace.primarySourceId;})||workspace.sources.find(function(item){return item.kind==='local-folder';});if(!source)throw new Error('The proof workspace has no local source.');
    [['native:source','Source.md'],['native:document','Document.docs.md'],['native:drawing','Drawing.canvas']].forEach(function(pair){records.set(pair[0],{name:pair[1],ref:{workspaceId:workspace.id,sourceId:source.id,path:pair[1]},draft:null});});
    function value(key,fallback){return Object.prototype.hasOwnProperty.call(ui.values,key)?ui.values[key]:fallback;}
    function persist(){
        if(writer)return writer;
        writer=(async function(){try{while(savedGeneration!==generation){var target=generation,submitted=JSON.stringify(ui);await A.SaveUIState(JSON.parse(submitted));persisted=submitted;savedGeneration=target;failure=null;}}catch(error){failure=error;throw error;}})().finally(function(){writer=null;});return writer;
    }
    function put(key,next){var before=JSON.stringify(ui.values[key]);ui.values[key]=next;if(JSON.stringify(next)!==before){generation++;persist().catch(function(){});}}
    async function read(request){
        var record=records.get(request.resource);if(!record)throw new Error('The resource is outside the synthetic proof workspace.');
        var loaded=await A.ReadWorkspaceResource(record.ref),draft=await A.OpenDraft(record.ref);
        if(draft.changed&&draft.text!==loaded.text)throw new Error('A native draft already contains unpresented changes. Open that draft in Dinah before proceeding.');
        record.draft=draft;
        return {resource:request.resource,name:record.name,text:loaded.text,revision:loaded.revision,writable:draft.writeBack==='save'};
    }
    async function write(request){
        var record=records.get(request.resource);if(!record||!record.draft)throw new Error('Read the native resource before writing.');
        var loaded=await A.ReadWorkspaceResource(record.ref);if(loaded.revision!==request.expectedRevision)throw new Error('Native resource conflict. The local source was retained.');
        var draft=await A.GetDraft(record.draft.id);if(draft.revision!==record.draft.revision||draft.baseline.revision!==request.expectedRevision)throw new Error('Native draft conflict. The host draft was retained.');
        var updated=await A.UpdateDraft(draft.id,draft.revision,request.text);record.draft=updated;
        var saved=await A.SaveDraft(updated.id,updated.revision);record.draft=saved;
        var actual=await A.ReadWorkspaceResource(record.ref);if(actual.text!==request.text||actual.revision!==saved.baseline.revision)throw new Error('The native save acknowledgement did not match its resource.');
        writes.push({resource:request.resource,text:request.text,revision:actual.revision});listeners.forEach(function(listener){listener();});
        return {resource:request.resource,name:record.name,revision:actual.revision,writable:saved.writeBack==='save'};
    }
    window.nativeProof={records:records,writes:writes,app:A,digest:C.digest,ready:false,lifecycle:function(){return {subscriptions:listeners.size,left:Array.from(leaves)};},persist:async function(){await persist();if(failure)throw failure;return persisted;},read:async function(resource){return A.ReadWorkspaceResource(records.get(resource).ref);}};
    window.pudlHost=pudlHostKit.host({pages:'/',pudl:new URL('/pudl/',location.href).href,
        contentWorkspace:{version:1,directory:function(){return null;}},
        contentResources:{version:1,read:read,write:write},
        config:{load:async function(app,defaults){return Object.assign({},defaults,value('yavc-proof-config:'+app,{}));},set:async function(app,next){put('yavc-proof-config:'+app,Object.assign({},value('yavc-proof-config:'+app,{}),next));await persist();if(failure)throw failure;},onChange:function(){return function(){};}},
        fs:{readText:async function(resource){var record=records.get(resource);return record?(await A.ReadWorkspaceResource(record.ref)).text:null;},onChange:function(listener){listeners.add(listener);return function(){listeners.delete(listener);};}},
        snapshot:{version:2,remembersClosed:true,join:function(root,take,options){var key='yavc-proof-snapshot:'+root.id,kept=value(key,null),left=false;if(options.validate)options.validate(kept);return {kept:kept,focused:false,changed:function(){if(!left)put(key,take());},flush:function(){if(left)return false;put(key,take());return !failure&&savedGeneration===generation;},leave:function(){if(!left){put(key,take());left=true;leaves.add(root.id);}}};}}
    });
    function fileServices(){return {files:{read:async function(resource){var record=records.get(resource);if(!record)throw new Error('The resource is outside the synthetic proof workspace.');return (await A.ReadWorkspaceResource(record.ref)).text;}}};}
    // These are host-defined capabilities. Writes still use the conditional
    // resource service; this fixture exposes no unconditional filename writer.
    pudlActions.capability('files.read',fileServices);pudlActions.capability('files.write',fileServices);
    document.addEventListener('pudl:applet-state',function(event){var id=event.target.id;event.detail.state='file='+encodeURIComponent(id==='source'?'native:source':id==='document'?'native:document':'native:drawing');});
    await Promise.all(['editor','docs','diagrams'].map(function(app){return pudlHostKit.install(new URL('/content/'+app+'/applet.json',location.href).href);}));
    window.nativeProof.ready=true;
})().catch(function(error){window.nativeProofError=error.message;document.body.textContent=error.message;});
