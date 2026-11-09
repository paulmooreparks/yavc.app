/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Runs inside the real receiving WebView, without a desktop input driver. */
(async function(){
    'use strict';
    var errors=[],checks=[],phase='Native Startup',config=window.nativeProofConfig;
    window.addEventListener('error',function(event){errors.push(event.message);});
    window.addEventListener('unhandledrejection',function(event){errors.push(String(event.reason&&event.reason.message||event.reason));});
    function assert(value,message){if(!value)throw new Error(message);}
    function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
    async function wait(test,label){var end=Date.now()+30000;while(Date.now()<end){var value=test();if(value)return value;await delay(50);}throw new Error('Timed out: '+label);}
    function cm(id){var element=document.querySelector('#'+id+' .cm-editor');return element&&CM.EditorView.findFromDOM(element);}
    function command(id,name){return pudlCommands.run(name,null,document.getElementById(id));}
    function action(app,name,input){return pudlActions.run('yavc.'+app+'/'+name+'@1',input||{},{grant:'all'});}
    async function report(result){
        result.runId=config.runId;result.phase=phase;result.checks=checks;result.errors=errors;result.userAgent=navigator.userAgent;result.visibility=document.visibilityState;result.digest=config.digest;
        if(window.nativeProof){await nativeProof.persist();}
        var A=go.main.App,state=await A.ReadUIState();state.values['yavc-proof-result']=result;await A.SaveUIState(state);
    }
    try{
        await wait(function(){return window.nativeProof&&nativeProof.ready||window.nativeProofError;},'Native host bootstrap');assert(!window.nativeProofError,window.nativeProofError);
        await wait(function(){return cm('source')&&cm('drawing')&&document.querySelector('#document .ProseMirror');},'Three native applet mounts');
        assert(typeof window.pcSiteFs==='undefined'&&typeof window.pcConfig==='undefined','A site-specific storage implementation was installed.');checks.push('Editor, Docs and Diagrams mount without site storage globals');
        phase='Asset Identity';
        var manifest=await (await fetch('/manifest.json')).json(),assets=0;assert(manifest.digest===config.digest,'Native artifact digest differs.');
        for(var start=0;start<manifest.files.length;start+=12)await Promise.all(manifest.files.slice(start,start+12).map(async function(file){var response=await fetch('/'+file.path);assert(response.ok,'Missing native asset '+file.path);var raw=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(function(value){return value.toString(16).padStart(2,'0');}).join('');assert(hash===file.sha256,'Native asset differs '+file.path);assets++;}));checks.push(assets+' immutable artifact hashes');
        phase='Native Source Save';
        var source=cm('source'),original=source.state.doc.toString();source.dispatch({changes:{from:source.state.doc.length,insert:'\nNative source edit.\n'}});await command('source','save');var saved=await nativeProof.read('native:source');assert(saved.text===original+'\nNative source edit.\n','Native source save differed.');checks.push('Native resource/draft conditional source save');
        phase='Native Rich Save';
        var before=(await action('docs','document')).text;await action('docs','insert',{text:'Native rich edit. '});var rich=(await action('docs','document')).text;assert(rich.includes('Native rich edit.'),'Rich insertion did not reach source.');await command('document','save');assert((await nativeProof.read('native:document')).text===rich,'Native rich save differed.');assert(!(await nativeProof.read('native:source')).text.includes('Native rich edit.'),'The rich save changed another applet.');checks.push('Rich transaction synchronizes before native save');
        phase='Native Review';
        var catalog=await action('docs','review'),at=rich.indexOf('Editable words');assert(at>=0,'Native document passage is missing.');await action('docs','review-propose',{revision:catalog.revision,from:at,to:at+8,kind:'deletion'});var reviewPromise=command('document','review-changes');
        var dialog=await wait(function(){return Array.from(document.querySelectorAll('dialog[open]')).find(function(node){return node.textContent.includes('Review Changes');});},'Native review dialog');var accept=dialog.querySelector('button[value="accept"]');assert(accept&&!accept.disabled,'Native review selection is unavailable.');accept.click();await wait(function(){return !yavcMdEngine.current().review(cm('document').state.doc.toString()).marks.length;},'Native review resolution');dialog.querySelector('button[data-choice="cancel"]').click();await reviewPromise;await command('document','undo');await command('document','undo');assert((await action('docs','document')).text===rich,'Native review Undo changed retained source.');checks.push('Native PUDL review list, resolution and Undo');
        phase='Native Canvas Save';
        var drawing=JSON.parse(cm('drawing').state.doc.toString());drawing.nativeProofExtension={retain:true};drawing.nodes[0].x+=20;var drawn=await action('diagrams','set-text',{text:JSON.stringify(drawing,null,2)});assert(drawn.drawn,'Native Canvas did not draw.');await command('drawing','save');var retained=JSON.parse((await nativeProof.read('native:drawing')).text);assert(retained.nativeProofExtension.retain&&retained.nodes[0].x===drawing.nodes[0].x,'Canvas properties were lost.');checks.push('Native Canvas rendering, source extension retention and conditional save');
        phase='Native D2 Worker';
        await yavcUtil.loadScript('/content/diagram-kit/d2.js');var d2=await yavcD2Engine.compile({text:'a: Native\nb: WebView\na -> b\n'},'native-proof');assert(d2&&d2.svg&&!(d2.problems&&d2.problems.length),'Native D2 worker failed.');checks.push('Native D2 worker and WebAssembly under isolated worker policy');
        phase='Native Language Workers';
        for(var sample of [{path:'~/Native.css',text:'p { col }',position:7,label:'color'},{path:'~/Native.html',text:'<but',position:4,label:'button'}]){
            await action('editor','new',{path:sample.path,text:sample.text});await wait(function(){var plugin=CM.LSPPlugin.get(cm('source'));return plugin&&plugin.client.serverCapabilities;},'Native language worker');var editor=cm('source');editor.dispatch({selection:{anchor:sample.position}});CM.startCompletion(editor);await wait(function(){return CM.currentCompletions(editor.state).some(function(item){return item.label===sample.label;});},'Native '+sample.label+' completion');CM.completionKeymap.find(function(binding){return binding.key==='Escape';}).run(editor);
        }checks.push('Native CSS and HTML language workers and completion');
        phase='Native Document Layout';
        await command('document','save');await document.fonts.ready;var flow=document.querySelector('#document .ProseMirror'),P=await yavcMdEditor.pages(),m=await yavcMdEngine(),front=m.front((await action('docs','document')).text),page=P.settings(P.properties(front)),layout=P.plan(P.blocks(flow),page);assert(!layout.oversized&&!layout.problem,'Native page measurement failed.');assert(layout.footnotes&&layout.footnotes.length===1,'Native footnote reservation is missing.');checks.push('Native rendered page and first-reference footnote measurement');
        phase='Native Conflict';
        var record=nativeProof.records.get('native:document'),current=await nativeProof.app.GetDraft(record.draft.id);await nativeProof.app.UpdateDraft(current.id,current.revision,current.text+'\nCompeting native draft.\n');await action('docs','insert',{text:'Local competing edit. '});var local=(await action('docs','document')).text,refused=false;try{await action('docs','save');}catch(error){refused=/conflict/i.test(error.message);}assert(refused,'A stale native draft save was accepted.');assert((await action('docs','document')).text===local,'Conflict discarded the local draft.');assert((await nativeProof.read('native:document')).text===rich,'Conflict changed the persisted native resource.');checks.push('Native competing-draft refusal retains local and host drafts');
        phase='Native Disposal';
        ['source','document','drawing'].forEach(function(id){pudlApplets.destroy(document.getElementById(id));});
        await wait(function(){var state=nativeProof.lifecycle();return state.left.length===3&&state.subscriptions===0;},'Native applet disposal and subscription cleanup');await nativeProof.persist();
        var kept=await nativeProof.app.ReadUIState();assert(['source','document','drawing'].every(function(id){return kept.values['yavc-proof-snapshot:'+id];}),'Native disposal did not persist recovery.');assert(!document.querySelector('[data-applet-state="running"]'),'A disposed native applet remains registered.');checks.push('Native applet disposal releases subscriptions and persists recovery');
        var remote=performance.getEntriesByType('resource').map(function(entry){return entry.name;}).filter(function(url){return /^https?:/.test(url)&&new URL(url).origin!==location.origin;});assert(!remote.length,'Native package fetched external dependencies.');assert(!errors.length,'Native page errors: '+errors.join('; '));
        phase='Complete';await report({ok:true,assets:assets,remote:remote,layout:{pages:layout.count,footnotes:layout.footnotes.length},limitations:['The proof window remains hidden. Shared desktop focus and operating-system dialogs were not exercised.','The fixture has one serialized UI-state owner; production shell integration needs its existing recovery owner.','The receiving resource adapter advertises UTF-8 version 1 only.']});
    }catch(error){await report({ok:false,message:error.message,stack:error.stack,actionProblems:window.pudlActions?await pudlActions.problems():[]}).catch(function(reportError){console.error('Native report failed',reportError);});}
})();
