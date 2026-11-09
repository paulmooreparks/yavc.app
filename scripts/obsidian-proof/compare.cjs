// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict');
function canonical(source){
    const doc=JSON.parse(JSON.stringify(source));
    // JSON Canvas 1.0 defaults allow either omission or these explicit heads.
    for(const edge of doc.edges||[]){if(edge.fromEnd===undefined)edge.fromEnd='none';if(edge.toEnd===undefined)edge.toEnd='arrow';}
    if(doc.nodes)doc.nodes.sort((a,b)=>a.id.localeCompare(b.id));
    return doc;
}
function compare(actual,expected){
    assert.deepEqual(canonical(actual),canonical(expected));
    const order=new Map(actual.nodes.map((node,index)=>[node.id,index]));
    // JSON Canvas orders overlapping nodes by z-index. Disjoint nodes can
    // move within the array without changing the resulting drawing.
    for(let i=0;i<expected.nodes.length;i++)for(let j=i+1;j<expected.nodes.length;j++){
        const a=expected.nodes[i],b=expected.nodes[j],overlap=Math.max(a.x,b.x)<Math.min(a.x+a.width,b.x+b.width)&&Math.max(a.y,b.y)<Math.min(a.y+a.height,b.y+b.height);
        if(overlap)assert.ok(order.get(a.id)<order.get(b.id),'Overlapping node order changed: '+a.id+' / '+b.id);
    }
}
module.exports={canonical,compare};
