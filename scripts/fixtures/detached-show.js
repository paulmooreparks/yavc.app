// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A synthetic host for the detached slide show test (scripts/test-detached-show.cjs):
// presentation version 2, with the show's page in another page of the same
// browser. The two ends are joined here by a BroadcastChannel, which stands
// in for the relay a real host provides between two processes.
(function(){
    'use strict';
    var params=new URLSearchParams(location.search);
    function end(name){
        var wire=new BroadcastChannel('fixture-detached-show'),port={onmessage:null,onclose:null,
            postMessage:function(message){fixture.show.sent.push(message);wire.postMessage({from:name,message:JSON.parse(JSON.stringify(message))});},
            close:function(){fixture.show.closed=true;wire.postMessage({from:name,closed:true});wire.close();}};
        wire.onmessage=function(e){var d=e.data||{};if(d.from===name)return;if(d.closed){if(port.onclose)port.onclose();return;}fixture.show.received.push(d.message);if(port.onmessage)port.onmessage(d.message);};
        return port;
    }
    fixture.show={opened:[],sent:[],received:[],closed:false,displays:params.has('one-display')?1:2,directories:[]};
    // A slide refers to a diagram beside the deck, which only the host's directory service can place.
    fixture.records.get('memory:deck.slides.md').text='# Slide one\n\nFirst.\n\n---\n\n# Slide two\n\nSecond.\n\n{{diagram:plan.canvas alt="Beside the deck"}}\n';
    pudlHost.contentWorkspace.directory=function(resource){fixture.show.directories.push(resource);return resource==='memory:deck.slides.md'||resource==='memory:document.docs.md'?'~/portable':null;};
    if(params.has('show')){
        // The show's page: the port and nothing else of the capability, and no service that reads or writes a deck.
        pudlHost.contentResources=undefined;pudlHost.contentResourceAdapter=undefined;
        pudlHost.presentation=params.has('no-port')?{version:2}:{version:2,showPort:function(){return end('show');}};
        document.addEventListener('pudl:applet-state',function(event){if(event.target.id==='deck')event.detail.state='show=1&channel=fixture';});
        return;
    }
    pudlHost.presentation=Object.assign({},pudlHost.presentation||{},{version:2,
        openShow:async function(request){fixture.show.opened.push(request);if(fixture.show.displays<2)return null;fixture.show.port=end('editor');return fixture.show.port;}});
})();
