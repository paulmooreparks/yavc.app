// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Synthetic host shortcodes that a host draws as frames and as flowing blocks, injected only by test-host-flow.cjs (docs/host-shortcodes-contract.md, "Long
// shortcodes across pages"). The html is the shape Dinah's host returns.
(function(){
    'use strict';
    var words=function(n){return Array.from({length:n},function(_,i){return 'word'+(i%17);}).join(' ');};
    var paragraphs=function(n){return Array.from({length:n},function(_,i){return 'Paragraph '+(i+1)+'. '+words(70);}).join('\n\n');};
    var source='# Flow\n\nIntro words.\n\n{{gkinfo}}\n'+paragraphs(24)+'\n{{/gkinfo}}\n\n{{gknote:Mind the gap}}\n'+paragraphs(24)+'\n{{/gknote}}\n\n{{gktoc}}\n\n{{gkinclude}}\n\n{{gkpiece}}\nA body.\n{{/gkpiece}}\n\n{{info}}\n'+paragraphs(24)+'\n{{/info}}\n\nClosing words.\n';
    fixture.records.get('memory:document.docs.md').text=source;
    var calls=[];
    var definitions=[
        {name:'gkinfo',title:'Info',kind:'container',example:'{{gkinfo}}\nBody.\n{{/gkinfo}}'},
        {name:'gknote',title:'Note',kind:'container',example:'{{gknote:Title}}\nBody.\n{{/gknote}}'},
        {name:'gktoc',title:'Contents',kind:'block',example:'{{gktoc}}'},
        {name:'gkinclude',title:'Include',kind:'block',example:'{{gkinclude}}'},
        {name:'gkpiece',title:'Piece',kind:'container',example:'{{gkpiece}}\nBody.\n{{/gkpiece}}'}
    ].map(function(d){return Object.assign({description:'Synthetic host shortcode',params:[]},d);});
    var rows=Array.from({length:40},function(_,i){return '<tr><td>R-'+(i+1)+'</td><td>'+words(60)+'</td></tr>';}).join('');
    var include='<div class="gk-include"><h2>Included Page</h2>'+Array.from({length:10},function(_,i){return '<p>Included paragraph '+(i+1)+'. '+words(70)+'</p>';}).join('')+'<table><thead><tr><th>ID</th><th>Requirement</th></tr></thead><tbody>'+rows+'</tbody></table><p>Last paragraph.</p></div>';
    var renders={
        gkinfo:{html:'<div class="gk-panel gk-panel-info" data-sc-frame="" data-sc-body=""><slot name="content"></slot></div>'},
        gknote:{html:'<div class="gk-panel gk-panel-note" data-sc-frame=""><p data-sc-repeat=""><strong>Mind the gap</strong></p><div data-sc-body=""><slot name="content"></slot></div></div>'},
        gktoc:{html:'<div class="gk-toc"><ul><li><a href="#one">One</a><ul><li><a href="#one-a">One A</a></li></ul></li><li><a href="#two">Two</a></li></ul></div>',flow:true},
        gkinclude:{html:include,flow:true},
        gkpiece:{html:'<div class="gk-panel" data-sc-piece="middle" data-sc-frame="" data-sc-body=""><slot name="content"></slot></div>'}
    };
    /* The frame's look, as Dinah gave it for the fixture, with the first, middle and last of a piece (docs/host-shortcodes-contract.md). */
    var style=document.createElement('style');
    style.textContent='.doc-page .gk-panel{position:relative;margin:8px 0;padding:10px 12px 10px 34px;border:1px solid transparent;border-radius:3px}.doc-page .gk-panel>p:first-child{margin-top:0}.doc-page .gk-panel>p:last-child{margin-bottom:0}'
        +'.doc-page .gk-panel::before{position:absolute;top:10px;left:12px;font-size:1em;line-height:1.5}.doc-page .gk-panel-info{background-color:#deebff;border-color:#b3d4ff}.doc-page .gk-panel-info::before{content:"\\2139";color:#0052cc}'
        +'.doc-page .gk-panel-note{background-color:#fffae6;border-color:#ffe380}.doc-page .gk-panel-note::before{content:"\\26A0";color:#ff8b00}'
        +'.doc-page .gk-panel[data-sc-piece="first"]{border-bottom-width:0;border-bottom-left-radius:0;border-bottom-right-radius:0}.doc-page .gk-panel[data-sc-piece="middle"]{border-top-width:0;border-bottom-width:0;border-radius:0}'
        +'.doc-page .gk-panel[data-sc-piece="last"]{border-top-width:0;border-top-left-radius:0;border-top-right-radius:0}.doc-page .gk-panel[data-sc-piece="middle"]::before,.doc-page .gk-panel[data-sc-piece="last"]::before{visibility:hidden}';
    document.head.appendChild(style);
    fixture.hostFlow={source:source,calls:calls};
    pudlHost.contentWorkspace.shortcodes=async function(){return {shortcodes:definitions};};
    pudlHost.contentWorkspace.shortcodeHost={version:1,
        render:async function(request){calls.push(request.name+'|'+request.args+'|'+request.source);return renders[request.name]||{error:{message:'unknown'}};},
        form:async function(){return null;},
        build:async function(){return {error:{message:'not built here'}};}
    };
})();
