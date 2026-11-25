(function(root){
'use strict';
const title='СПЕЦИФИКАЦИЯ МАФ';
const font='Manrope';
const ink='#141414';
const muted='#686868';
const line='#b5b5b5';

function characteristics(p){
 const lines=[];
 if(p.dimensions)lines.push('Габариты: '+p.dimensions);
 if(p.materials&&p.materials.length)lines.push('Материалы: '+p.materials.join(', '));
 for(const [key,value] of Object.entries(p.specifications||{})){
  if(value&&/зона безопас|высота паден|возраст|тип крепл/i.test(key))lines.push(key+': '+value);
 }
 return lines.length?lines.join('\n'):'Характеристики не указаны';
}
function documentDefinition(rows,date){
 const qty=rows.reduce((n,r)=>n+r.quantity,0);
 const headers=['ИЗОБРАЖЕНИЕ','НАИМЕНОВАНИЕ','АРТИКУЛ','ХАРАКТЕРИСТИКА','КОЛ-ВО, ШТ.'].map(text=>({text,bold:true,fontSize:9}));
 const body=[headers,...rows.map(({product:p,quantity,image})=>[
  image?{image,fit:[80,60],alignment:'center'}:{text:'Нет изображения',fontSize:8,color:muted},
  {stack:[
   {text:p.name,bold:true,margin:[0,0,0,4]},
   {text:p.manufacturer,fontSize:9,color:muted},
   {text:'Страница производителя',link:/^https?:\/\//.test(p.url||'')?p.url:undefined,fontSize:8,color:muted,margin:[0,4,0,0]}
  ]},
  {text:p.sku||'—',fontSize:10},
  {text:characteristics(p),fontSize:10},
  {text:String(quantity),bold:true,alignment:'center'}
 ])];
 return {
  info:{title},
  pageSize:'A4',pageOrientation:'landscape',pageMargins:[32,34,32,36],
  defaultStyle:{font,fontSize:10,lineHeight:1.2,color:ink},
  content:[
   {columns:[
    {text:title,fontSize:24},
    {text:date,width:'auto',fontSize:10,color:muted,margin:[0,10,0,0]}
   ],margin:[0,0,0,20]},
   {table:{headerRows:1,widths:[80,'*',85,220,52],body},layout:{
    hLineWidth:()=>.5,vLineWidth:()=>.5,hLineColor:()=>line,vLineColor:()=>line,
    paddingLeft:function(){return 8;},paddingRight:function(){return 8;},paddingTop:function(){return 9;},paddingBottom:function(){return 9;}
   }},
   {text:'Позиций: '+rows.length+'    Всего изделий: '+qty+' шт.',bold:true,fontSize:11,margin:[0,14,0,0]}
  ],
  footer:(page,pages)=>({text:page+' / '+pages,alignment:'right',fontSize:8,color:muted,margin:[32,12,32,0]})
 };
}

function workbook(rows,date,ExcelJS){
 const wb=new ExcelJS.Workbook();
 wb.title=title;
 wb.created=new Date();
 const ws=wb.addWorksheet('Спецификация МАФ',{
  views:[{state:'frozen',ySplit:4,showGridLines:false}],
  pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'4:4'}
 });
 const textFont={name:font,size:11,color:{argb:'FF'+ink.slice(1)}};
 const borderLine={style:'thin',color:{argb:'FF'+line.slice(1)}};
 ws.columns=[{width:22},{width:43},{width:22},{width:58},{width:15}];
 ws.mergeCells('A1:E1');
 const heading=ws.getCell('A1');
 heading.value=title;
 heading.font={...textFont,size:24};
 heading.alignment={vertical:'middle'};
 ws.getRow(1).height=36;
 ws.mergeCells('A2:E2');
 const dateCell=ws.getCell('A2');
 dateCell.value=date;
 dateCell.font={...textFont,color:{argb:'FF'+muted.slice(1)}};
 dateCell.alignment={horizontal:'right',vertical:'middle'};
 ws.getRow(2).height=24;
 const header=ws.getRow(4);
 header.values=['Изображение','Наименование','Артикул','Характеристика','Количество, шт.'];
 header.height=30;
 header.eachCell(c=>{
  c.font={...textFont,bold:true};
  c.alignment={vertical:'middle',wrapText:true};
  c.border={top:borderLine,left:borderLine,right:borderLine,bottom:borderLine};
 });
 rows.forEach(({product:p,quantity,image},i)=>{
  const rowNumber=i+5,row=ws.getRow(rowNumber);
  const name=p.name+'\n'+p.manufacturer;
  const details=characteristics(p);
  row.values=[image?'':'Нет изображения',name,p.sku||'—',details,quantity];
  row.height=Math.max(90,Math.ceil(details.length/52)*14+16,Math.ceil(p.name.length/38)*14+28);
  row.eachCell({includeEmpty:true},(c,col)=>{
   c.font={...textFont,bold:col===5};
   c.alignment={vertical:'middle',wrapText:true,horizontal:col===5?'center':'left'};
   c.border={top:borderLine,left:borderLine,right:borderLine,bottom:borderLine};
  });
  row.getCell(3).numFmt='@';
  if(/^https?:\/\//.test(p.url||'')){
   row.getCell(2).value={text:name,hyperlink:p.url};
   row.getCell(2).font={...textFont,bold:true,underline:true};
  }
  if(image){const id=wb.addImage({base64:image,extension:'jpeg'});ws.addImage(id,{tl:{col:.08,row:rowNumber-1+.06},ext:{width:140,height:105},editAs:'oneCell'});}
 });
 const last=rows.length+5;
 ws.mergeCells('A'+last+':D'+last);
 ws.getCell('A'+last).value='Всего изделий';
 ws.getCell('E'+last).value=rows.reduce((sum,r)=>sum+r.quantity,0);
 ws.getRow(last).font={...textFont,size:12,bold:true};
 ws.getRow(last).height=26;
 ws.autoFilter={from:'A4',to:'E'+(last-1)};
 ws.pageSetup.printArea='A1:E'+last;
 return wb;
}

root.MafSpecification={characteristics,documentDefinition,workbook};
})(typeof window!=='undefined'?window:globalThis);
