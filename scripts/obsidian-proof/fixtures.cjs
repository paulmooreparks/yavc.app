// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
function fixtures(){
    const extended={nodes:[
        {id:'group',type:'group',x:-50,y:-70,width:1000,height:600,label:'Compatibility Group',background:'Assets/paper.svg',backgroundStyle:'ratio',foreign:{keep:'group'}},
        {id:'editable',type:'text',x:0,y:0,width:220,height:140,text:'Editable card\n\nPreserve standard content.',color:'5',yavc:{shape:'oval',textAlign:'center',textVerticalAlign:'middle',fillColor:'#ffffff',strokeColor:'#228855'},foreign:{keep:['node',1]}},
        {id:'file',type:'file',x:300,y:0,width:220,height:140,file:'Notes/Reference.md',subpath:'#Heading',foreign:{keep:{nested:true}}},
        {id:'link',type:'link',x:600,y:0,width:220,height:140,url:'https://example.invalid',foreign:['link',2]},
        {id:'free',type:'text',x:500,y:230,width:0,height:0,text:'',yavc:{shape:'text',anchor:true}},
        ...Array.from({length:6},(_,i)=>({id:'color'+(i+1),type:'text',x:i*150,y:290,width:130,height:100,text:'Preset '+(i+1),color:String(i+1)}))
    ],edges:[
        {id:'forward',fromNode:'editable',toNode:'file',fromSide:'right',toSide:'left',fromEnd:'none',toEnd:'arrow',color:'#123456',label:'Reference',yavc:{route:'curve',line:'dashed'},foreign:{keep:['edge',3]}},
        {id:'reverse',fromNode:'file',toNode:'link',fromSide:'right',toSide:'left',fromEnd:'arrow',toEnd:'none',label:'Reverse'},
        {id:'both',fromNode:'color1',toNode:'color2',fromSide:'bottom',toSide:'bottom',fromEnd:'arrow',toEnd:'arrow',color:'2',label:'Both'},
        {id:'automatic',fromNode:'color4',toNode:'color5',label:'Automatic sides'},
        {id:'free-edge',fromNode:'editable',toNode:'free',label:'Free endpoint'}
    ],yavc:{version:1,background:'#fafafa',grid:true},foreign:{keep:['top',4]}};
    const standard=JSON.parse(JSON.stringify(extended));delete standard.yavc;delete standard.foreign;
    for(const item of [...standard.nodes,...standard.edges]){delete item.yavc;delete item.foreign;}
    return {extended,standard};
}
module.exports={fixtures};
