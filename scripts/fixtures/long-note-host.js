// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The host shortcodes that GK Companion registers for its long concept notes, as synthetic drawings, injected after the portable host by
// test-document-layout-cycle.cjs (docs/host-shortcodes-contract.md): `raw` and `scroll-ignore` as containers that give a content slot and no frame,
// `toc` as a flowing block, `jira` and `status` as inline marks. The diagram shortcode is the applet's own, and the host answers its file with "not found".
(function(){
    'use strict';
    var entry=function(name,kind,example){return {name:name,title:name,kind:kind,example:example,description:'Synthetic host shortcode',params:[]};};
    var definitions=[entry('raw','container','{{raw}}\nBody.\n{{/raw}}'),entry('scroll-ignore','container','{{scroll-ignore}}\nBody.\n{{/scroll-ignore}}'),entry('toc','block','{{toc}}'),entry('jira','inline','{{jira:KEY-1 Summary}}'),entry('status','inline','{{status:Done}}')];
    var lines=Array.from({length:60},function(_,i){return '<li><a href="#h'+i+'">Synthetic heading '+(i+1)+'</a></li>';}).join('');
    var renders={
        raw:function(){return {html:'<slot name="content"></slot>'};},
        'scroll-ignore':function(){return {html:'<slot name="content"></slot>'};},
        toc:function(){return {html:'<ul class="gk-toc">'+lines+'</ul>',flow:true};},
        jira:function(r){return {html:'<span class="gk-jira">'+String(r.args).replace(/[<>&]/g,'')+'</span>'};},
        status:function(r){return {html:'<span class="gk-status">'+String(r.args).replace(/[<>&]/g,'')+'</span>'};}
    };
    pudlHost.contentWorkspace.shortcodes=async function(){return {shortcodes:definitions};};
    pudlHost.contentWorkspace.shortcodeHost={version:1,
        render:async function(request){var f=renders[request.name];return f?f(request):{error:{message:'unknown'}};},
        form:async function(){return null;},
        build:async function(){return {error:{message:'not built here'}};}
    };
})();
