// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A synthetic host for the canvas picture and text test (scripts/test-canvas-pictures.cjs).
// It is appended to each lab's host script. The host resolves a picture's path to an
// address the test's own server serves, as docs/document-host-overlays-contract.md
// describes, and records what it was asked. The pictures are neutral stand-ins made for
// this test.
(function(){
    'use strict';
    var pictures=new URL('../fixture-pictures/',location.href).href,known=['icons/home.svg','icons/plain.svg','icons/logo.png','icons/fake.png','icons/large.svg','icons/moved.svg'];
    // delay is how long, in milliseconds, the host takes to answer for a picture, so that a test can make a drawing slow.
    fixture.pictures={asked:[],delay:0};
    var workspace=pudlHost.contentWorkspace||(pudlHost.contentWorkspace={version:1});
    workspace.resources={resolve:async function(request){
        fixture.pictures.asked.push({resource:request.resource,href:request.href,kind:request.kind});
        if(fixture.pictures.delay)await new Promise(function(resolve){setTimeout(resolve,fixture.pictures.delay);});
        if(request.href==='icons/outside.svg')return {url:'https://example.com/outside.svg'};
        return known.indexOf(request.href)>=0?{url:pictures+request.href.replace('icons/','')}:null;
    }};
    var screen={nodes:[
        {id:'key',type:'text',x:0,y:0,width:200,height:80,text:'Total\\\n12.50',yavc:{style:'key',fontSize:22,padding:2}},
        {id:'home',type:'file',x:20,y:16,width:48,height:48,file:'icons/home.svg',yavc:{tint:'#ffffff'}},
        {id:'plain',type:'file',x:300,y:0,width:48,height:48,file:'icons/plain.svg'},
        {id:'logo',type:'file',x:400,y:0,width:48,height:48,file:'icons/logo.png',color:'1',yavc:{fit:'stretch'}},
        {id:'fake',type:'file',x:0,y:120,width:120,height:48,file:'icons/fake.png'},
        {id:'missing',type:'file',x:140,y:120,width:120,height:48,file:'icons/missing.svg'},
        {id:'large',type:'file',x:280,y:120,width:120,height:48,file:'icons/large.svg'},
        {id:'outside',type:'file',x:420,y:120,width:120,height:48,file:'icons/outside.svg'},
        {id:'line',type:'text',x:0,y:200,width:200,height:40,text:'Subtotal',yavc:{radius:0,outlineSides:['bottom'],strokeColor:'#ff0000'}}
    ],edges:[],yavc:{version:1,font:'Georgia',styles:{key:{shape:'rectangle',radius:6,fillColor:'#00a0e6',outlineSides:[],textColor:'#ffffff',fontWeight:500,fontFamily:'Roboto, Arial',textAlign:'right',textVerticalAlign:'bottom'}}}};
    if(fixture.records.has('memory:second.canvas'))fixture.records.get('memory:second.canvas').text=JSON.stringify(screen,null,2);
    // A document that refers to a saved canvas, whose picture is beside the canvas.
    if(fixture.records.has('~/portable/plan.canvas')){
        fixture.records.set('~/portable/screens/plan.canvas',{text:JSON.stringify({nodes:[{id:'moved',type:'file',x:0,y:0,width:48,height:48,file:'icons/moved.svg'}],edges:[]}),revision:1,name:'plan.canvas'});
        workspace.resources.resolve=(function(inner){return async function(request){
            if(request.href==='screens/icons/moved.svg'){fixture.pictures.asked.push({resource:request.resource,href:request.href,kind:request.kind});return {url:pictures+'moved.svg'};}
            // A path from the document's web site, which this host keeps somewhere of its own until the test moves it.
            if(request.href==='/site/logo.png'){fixture.pictures.asked.push({resource:request.resource,href:request.href,kind:request.kind});return fixture.pictures.webRoot?{url:pictures+fixture.pictures.webRoot}:null;}
            return inner(request);
        };})(workspace.resources.resolve);
        fixture.records.get('memory:document.docs.md').text='# Document\n\n{{diagram:screens/plan.canvas alt="A screen"}}\n\n```canvas\n'+JSON.stringify({nodes:[{id:'home',type:'file',x:0,y:0,width:48,height:48,file:'icons/home.svg'},{id:'missing',type:'file',x:80,y:0,width:120,height:48,file:'icons/missing.svg'}],edges:[]})+'\n```\n\nEditable words.\n\n## Anchored {#anchored .wide}\n\nA [link](https://example.com/){target="_blank" rel="noopener"} with attributes.\n\n![Site picture](/site/logo.png)\n';
        // The host says that files changed, as it does after its web root moves.
        var listeners=new Set(),fsHost=pudlHost.fs||(pudlHost.fs={}),watched=fsHost.onChange;
        fsHost.onChange=function(fn){listeners.add(fn);var off=watched?watched.call(fsHost,fn):null;return function(){listeners.delete(fn);if(off)off();};};
        fixture.pictures.moved=function(to){fixture.pictures.webRoot=to;listeners.forEach(function(fn){fn();});};
    }
})();
