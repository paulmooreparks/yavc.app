// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Synthetic services injected only by the independent-host shortcode test.
(function(){
    'use strict';
    var source='# Host shortcodes\n\nSee {{ticket:EX-1}} and {{@alex}}.\n\n{{children}}\n\n{{panel:Original}}\nEditable **body**.\n{{/panel}}\n\nSome {{target:one}}marked **words**{{/target}} here.\n\n{{thread:id=1}}\nManaged body.\n{{/thread}}\n';
    fixture.records.get('memory:source.md').text=source;fixture.records.get('memory:document.docs.md').text=source;
    var calls=[],forms=[],catalogCalls=0,hold=null;
    var definitions=[
        {name:'ticket',title:'Ticket',kind:'inline',example:'{{ticket:EX-1}}'},
        {name:'person',title:'Person',kind:'inline',prefix:'@',example:'{{@alex}}'},
        {name:'children',title:'Children',kind:'block',example:'{{children}}'},
        {name:'panel',title:'Panel',kind:'container',example:'{{panel:Example}}\nBody.\n{{/panel}}'},
        {name:'target',title:'Target',kind:'span',example:'{{target:one}}Words.{{/target}}'},
        {name:'thread',title:'Thread',kind:'container',managed:true,example:'{{thread:id=1}}\nManaged body.\n{{/thread}}'}
    ].map(function(d){return Object.assign({description:'Synthetic host shortcode',params:[]},d);});
    fixture.hostShortcodes={calls:calls,forms:forms,catalogCalls:function(){return catalogCalls;},hold:function(){hold={};hold.promise=new Promise(function(resolve){hold.release=resolve;});},release:function(){var gate=hold;hold=null;if(gate)gate.release();},source:source};
    pudlHost.contentWorkspace.shortcodes=async function(){catalogCalls++;return {shortcodes:definitions.concat([{name:'bad name',title:'Invalid',kind:'inline',description:'Refused'},{name:'constructor',title:'Constructor',kind:'wrong',description:'Refused'}])};};
    pudlHost.contentWorkspace.shortcodeHost={version:1,
        render:async function(request,context){calls.push({request:request,resource:context&&context.resource});var gate=hold;if(gate)await gate.promise;
            if(request.kind==='container'||request.kind==='span')return {html:'<span class="host-frame" style="border:1px solid #345678"><slot name="content"></slot></span>'};
            return {html:'<span class="host-result">'+yavcUtil.esc(request.name+': '+request.args)+'</span><script>window.hostAttack=true</script><button data-command="save" onclick="window.hostAttack=true">Ignored action</button>'};},
        form:async function(source){forms.push(source);var match=/^\{\{(ticket|panel|target):([^}]*)/.exec(source);if(!match)return null;var name=match[1],value=match[2];return {kind:name,title:name==='panel'?'Panel':name==='target'?'Target':'Ticket',description:'A host-owned form',fields:[{name:'value',label:name==='ticket'?'Key':'Title',description:'The host validates this value',required:true,value:value}]};},
        build:async function(kind,values){if(kind==='ticket'&&!/^EX-\d+$/.test(values.value))return {error:{field:'value',message:'Use an EX issue key.'}};return {source:'{{'+kind+':'+values.value+'}}'};}
    };
    if(new URLSearchParams(location.search).has('slow'))fixture.hostShortcodes.hold();
})();
