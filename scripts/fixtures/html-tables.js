// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Synthetic host services and documents injected only by the HTML table,
// place-keeping and contents-list test (scripts/test-html-tables.cjs).
(function(){
    'use strict';
    var table='<table><tbody>\n<tr><th colspan="2">Scenario</th></tr>\n<tr><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Number</strong></td><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Action</strong></td></tr>\n<tr><td>1</td><td>Press <code>&quot;Pay&quot;</code> and see <ac:link><ri:page ri:content-title="Exports" /></ac:link> here.<br />Second line.</td></tr>\n<tr><td class="highlight-grey kept" data-highlight-colour="grey">grey</td><td class="highlight-blue">blue</td></tr>\n</tbody></table>';
    var source='# Contents first\n\n{{note}}\n\n{{toc:maxLevel=3 outline=true}}\n\n{{/note}}\n\n## Wiki table\n\n{{raw}}\n'+table+'\n{{/raw}}\n\n## Bare table\n\n<table>\n<tr><td>bare</td><td rowspan="2">tall</td></tr>\n<tr><td>row</td></tr>\n</table>\n\n## Pipe table\n\n| A | B |\n| --- | --- |\n| one | two |\n| three | four |\n\n## Literal rest\n\n{{raw}}\n<div>\n\n<p>Two paragraphs.</p>\n</div>\n{{/raw}}\n\n'+Array.from({length:40},function(_,i){return 'Filler paragraph '+(i+1)+' keeps the page long enough to scroll.';}).join('\n\n')+'\n\n## Last heading\n\nLast words here.\n';
    fixture.records.get('memory:source.md').text=source;fixture.records.get('memory:document.docs.md').text=source;
    fixture.records.get('memory:deck.slides.md').text='# Slide one\n\nFirst.\n\n{{notes}}\nSay this quietly.\n{{/notes}}\n\n---\n\n# Slide two\n\nSecond.\n';
    fixture.htmlTables={source:source,table:table};
    pudlHost.contentWorkspace.shortcodes=async function(){return {shortcodes:[{name:'raw',title:'Raw Storage Format',kind:'container',literal:true,colorAttribute:'data-highlight-colour',colorClassPrefix:'highlight-',description:'Literal markup',params:[],example:'{{raw}}\n<p>x</p>\n{{/raw}}'}]};};
    pudlHost.contentWorkspace.shortcodeHost={version:1,
        render:async function(request){return {html:'<div class="host-raw-frame"><slot name="content"></slot></div>'};},
        form:async function(){return null;},
        build:async function(kind,values){return {source:'{{'+kind+'}}'};}
    };
})();
