// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Synthetic host services and documents injected only by the HTML table,
// place-keeping and contents-list test (scripts/test-html-tables.cjs).
(function(){
    'use strict';
    var table='<table><tbody>\n<tr><th colspan="2">Scenario</th></tr>\n<tr><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Number</strong></td><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Action</strong></td></tr>\n<tr><td>1</td><td>Press <code>&quot;Pay&quot;</code> and see <ac:link><ri:page ri:content-title="Exports" /></ac:link> here.<br />Second line.</td></tr>\n<tr><td class="highlight-grey kept" data-highlight-colour="grey">grey</td><td class="highlight-blue">blue</td></tr>\n</tbody></table>';
    var source='# Contents first\n\n{{note}}\n\n{{toc:maxLevel=3 outline=true}}\n\n{{/note}}\n\n## Wiki table\n\n{{raw}}\n'+table+'\n{{/raw}}\n\n## Bare table\n\n<table>\n<tr><td>bare</td><td rowspan="2">tall</td></tr>\n<tr><td>row</td></tr>\n</table>\n\n## Pipe table\n\n| A | B |\n| --- | --- |\n| one | two |\n| three | four |\n\n## Citations\n\nCited words here. [S2]\n\n## Literal rest\n\n{{raw}}\n<div>\n\n<p>Two paragraphs.</p>\n</div>\n{{/raw}}\n\n'+Array.from({length:40},function(_,i){return 'Filler paragraph '+(i+1)+' keeps the page long enough to scroll.';}).join('\n\n')+'\n\n## Last heading\n\nLast words here.\n';
    fixture.records.get('memory:source.md').text=source;fixture.records.get('memory:document.docs.md').text=source;
    fixture.records.get('memory:deck.slides.md').text='# Slide one\n\nFirst.\n\n{{notes}}\nSay this quietly.\n{{/notes}}\n\n---\n\n# Slide two\n\nSecond.\n';
    fixture.htmlTables={source:source,table:table};
    pudlHost.contentWorkspace.shortcodes=async function(){return {shortcodes:[{name:'raw',title:'Raw Storage Format',kind:'container',literal:true,colorAttribute:'data-highlight-colour',colorClassPrefix:'highlight-',description:'Literal markup',params:[],example:'{{raw}}\n<p>x</p>\n{{/raw}}'},
        {name:'cell-colour',title:'Cell Color',kind:'inline',cellColor:true,description:'The colour of a table cell',params:[],example:'{{cell-colour:blue}}'}]};};
    pudlHost.contentWorkspace.shortcodeHost={version:1,
        render:async function(request){
            if(request.name==='cell-colour')return {html:'<span class="host-swatch">'+yavcUtil.esc(request.args)+'</span>'};
            return {html:'<div class="host-raw-frame"><slot name="content"></slot></div>'};},
        form:async function(source){var m=/^\{\{cell-colour(?::([^}]*))?\}\}$/.exec(source);return m?{kind:'cell-colour',title:'Cell Color',description:'A host-owned colour',fields:[{name:'colour',label:'Color',description:'blue, grey or a hex colour',required:true,value:m[1]||''}]}:null;},
        build:async function(kind,values){
            if(kind!=='cell-colour')return {source:'{{'+kind+'}}'};
            if(!/^(blue|grey|#[0-9a-f]{6})$/i.test(values.colour||''))return {error:{field:'colour',message:'Use blue, grey or a hex color.'}};
            return {source:'{{cell-colour:'+values.colour+'}}'};}
    };
    /* A host whose new documents have no saved location yet: Save is to ask for one. */
    var resources=pudlHost.contentResources,saveAsCalls=[];
    fixture.htmlTables.saveAsCalls=saveAsCalls;fixture.htmlTables.unplaced=new Set();
    pudlHost.contentResources={version:resources.version,
        read:async function(request){var r=await resources.read(request);return fixture.htmlTables.unplaced.has(request.resource)?Object.assign({},r,{needsLocation:true}):r;},
        write:async function(request){var r=await resources.write(request);return fixture.htmlTables.unplaced.has(request.resource)?Object.assign({},r,{needsLocation:true}):r;},
        saveAs:async function(request){saveAsCalls.push({name:request.name,source:request.sourceResource,text:request.text});return null;}};
    if(new URLSearchParams(location.search).has('unplaced')){fixture.htmlTables.unplaced.add('memory:document.docs.md');fixture.htmlTables.unplaced.add('memory:deck.slides.md');}
})();
