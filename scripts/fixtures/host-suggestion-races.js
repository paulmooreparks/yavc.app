/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Evaluated by the browser proof against the public overlay controller. */
(async function(){
    var root=document.createElement('div');root.style.cssText='width:800px;height:200px';document.body.append(root);
    var owner={path:'draft:A',resource:{revision:'1',text:'Alpha'}},editor=null,controller=null,life=new AbortController(),callbacks=[],calls=[],releases=[],prepare=null,offs=0;
    var provider={subscribe:function(resource,callback){callbacks.push(callback);callback({revision:'1',text:'Alpha',items:[{id:'shared',start:0,end:5,before:'Alpha',after:resource,author:'Agent'}]});return function(){offs++;};},decide:async function(request){calls.push(request);await new Promise(function(resolve){releases.push(resolve);});}};
    controller=yavcHostSuggestions.create(CM,{provider:provider,root:root,signal:life.signal,owner:function(){return owner;},view:function(){return editor;},text:function(){return editor.state.doc.toString();},rich:function(){return null;},readOnly:function(){return false;},prepare:async function(){if(prepare)await prepare;},say:function(message){throw new Error(message);},changed:function(){},edit:async function(value){return value;},navigate:async function(){},focus:function(){editor.focus();}});
    function state(){return CM.EditorState.create({doc:'Alpha',extensions:[controller.extension,CM.EditorView.updateListener.of(function(update){controller.update(update);})]});}
    editor=new CM.EditorView({parent:root,state:state()});controller.refresh();await Promise.resolve();
    for(var removed of ['Previous wording','Revised removal']){
        callbacks[0]({revision:'1',text:'Alpha',items:[{id:'shared',start:0,end:5,before:removed,after:'draft:A',author:'Agent',stale:true}]});await Promise.resolve();
        if(root.querySelector('del').textContent!==removed)throw new Error('Updated removal wording retained an old widget.');
    }
    callbacks[0]({revision:'1',text:'Alpha',items:[{id:'shared',start:0,end:5,before:'Alpha',after:'draft:A',author:'Agent'}]});await Promise.resolve();
    var releasePrepare;prepare=new Promise(function(resolve){releasePrepare=resolve;});
    var old=controller.decide('shared','accept'),duplicate=controller.decide('shared','accept');
    owner={path:'draft:B',resource:{revision:'1',text:'Alpha'}};editor.setState(state());controller.refresh();await Promise.resolve();
    prepare=null;releasePrepare();await Promise.all([old,duplicate]);
    if(calls.length)throw new Error('A decision crossed resource ownership during preparation.');
    var pendingB=controller.decide('shared','accept');await Promise.resolve();await Promise.resolve();
    if(calls.length!==1||calls[0].resource!=='draft:B')throw new Error('The B decision was not captured.');
    owner={path:'draft:A',resource:{revision:'1',text:'Alpha'}};editor.setState(state());controller.refresh();await Promise.resolve();
    var pendingA=controller.decide('shared','accept');await Promise.resolve();await Promise.resolve();
    if(calls.length!==2||calls[1].resource!=='draft:A')throw new Error('The A decision was not captured.');
    releases[0]();await pendingB;
    if(!root.querySelector('button[data-suggestion-action="accept"]').disabled)throw new Error('An old decision cleared the new resource pending state.');
    callbacks[0]({revision:'1',text:'Alpha',items:[{id:'late',start:0,end:5,before:'Alpha',after:'WRONG'}]});await Promise.resolve();
    if(root.querySelector('[data-host-suggestion="late"]'))throw new Error('An unsubscribed callback repainted the new resource.');
    life.abort();releases[1]();await pendingA;
    if(editor.state.doc.toString()!=='Alpha')throw new Error('Overlay decisions modified source.');
    editor.destroy();root.remove();return {decisions:calls.length,unsubscribed:offs};
})()
