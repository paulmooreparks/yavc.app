/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Appended only by the host-overlay proof server, never by a real host. */
(function(){
    'use strict';
    var callbacks=new Map(),catalogs=new Map(),calls=[],assetCalls=[],unsubscribed=0;
    var text='# Overlay sample\n\nOriginal words.\n\n![](shot.png)\n';
    fixture.records.get('memory:document.docs.md').text=text;
    fixture.records.get('memory:source.md').text=text;
    fixture.records.get('memory:deck.slides.md').text='# Slide\n\n![](shot.png)\n';
    function catalog(resource){var record=fixture.records.get(resource),start=record.text.indexOf('Original');return {revision:String(record.revision),text:record.text,items:start<0?[]:[{id:'proposal-1',start:start,end:start+8,before:'Original',after:'Improved',author:'Review agent',reason:'Use clearer wording.',group:'group-1',stale:false,edited:false}]};}
    pudlHost.contentWorkspace.resources={resolve:async function(request,context){assetCalls.push(request);if(!context.current())return null;return {url:'/draft-file?'+new URLSearchParams({draft:request.resource,name:request.href})};}};
    pudlHost.contentWorkspace.suggestions={
        subscribe:function(resource,callback,context){var set=callbacks.get(resource)||new Set();callbacks.set(resource,set);set.add(callback);callback(catalogs.get(resource)||catalog(resource));return function(){unsubscribed++;set.delete(callback);};},
        decide:async function(request,context){calls.push(request);if(fixture.holdDecision)await new Promise(function(resolve){fixture.releaseDecision=resolve;});if(fixture.failDecision)throw new Error('Injected host decision refusal.');if(!context.current())throw new Error('The source changed before the host handled this decision.');}
    };
    fixture.overlays={calls:calls,assetCalls:assetCalls,publish:function(resource,snapshot){catalogs.set(resource,snapshot);(callbacks.get(resource)||[]).forEach(function(callback){callback(snapshot);});},catalog:catalog,
        subscriptions:function(){return Array.from(callbacks.values()).reduce(function(sum,set){return sum+set.size;},0);},unsubscribed:function(){return unsubscribed;},
        remount:function(app){var id=app==='docs'?'document':app==='editor'?'source':'deck',old=document.querySelector('[data-applet="'+app+'"]');pudlApplets.destroy(old);var next=document.createElement('div');next.id=id;next.dataset.applet=app;next.setAttribute('data-applet-flush','');old.replaceWith(next);pudlApplets.boot(next.parentNode);}
    };
})();
