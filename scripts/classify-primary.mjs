// Classify by the leading object, before model names and attached components.
export function primaryCategory(p){
 const n=p.name.toLowerCase().replace(/ё/g,'е').trim();
 const head=n.split(/[«"“(]/)[0].split(/\s(?:с|со|для|из|на|под|без)\s/)[0].trim();
 const city='Городская мебель',child='Детское оборудование',sport='Спортивное оборудование',other='Другие изделия';
 const result=(category,section=p.section)=>({category,section});
 if(p.category==='Площадки для собак'||/для собак|аджилити/.test(p.sourceCategory||''))return null;
 if(p.section===child&&/кресло-карусель/.test(head))return result('Карусели');
 if(p.section===child&&/качел[а-я]*[- ]балансир/.test(head))return result('Балансиры');
 if(p.section===child&&/качалка-балансир/.test(head)&&/пружин/.test(n))return result('Качалки на пружине');
 if(/^диван-качели/.test(head))return result('Качели',city);
 if(/^(?:новогодняя|световая|праздничная) (?:арка|инсталляция)/.test(head))return result('Арт-объекты',city);
 const rules=[
 [/барбекю-зон[а-я]*/,()=>result('Барбекю-зоны',city)],
 [/светильник[а-я]*|фонар[а-я]*/,()=>result('Освещение',other)],
 [/ель|елк[а-я]*/,()=>/новогодн/.test(head)?result('Праздничное оформление',other):null],
 [/контейнерн[а-я]* площадк[а-я]*/,()=>result('Контейнерные площадки',other)],
 [/понтон[а-я]*|террас[а-я]*|раздевалк[а-я]*/,()=>result('Другое',other)],
 [/парклет[а-я]*/,()=>result('Парклеты',other)],
 [/подиум[а-я]*/,()=>p.section===sport?null:result('Подиумы',other)],
 [/качели-балансир[а-я]*|качалка-балансир[а-я]*|балансир[а-я]*/,()=>p.section===sport?null:result('Балансиры',child)],
 [/качел[а-я]*/,()=>result(p.section===child?'Детские качели':'Качели',p.section===child?child:city)],
 [/качалк[а-я]*/,()=>result(/пружин/.test(n+' '+p.sourceCategory)?'Качалки на пружине':'Балансиры',child)],
 [/карусел[а-я]*/,()=>result('Карусели',child)],
 [/пергол[а-я]*|навес[а-я]*|беседк[а-я]*|останов[а-я]*/,()=>result('Навесы, перголы и остановки',city)],
 [/скам[а-я]*|лавочк[а-я]*|лавк[а-я]*|диван[а-я]*|банкетк[а-я]*/,()=>p.section===sport?null:result('Скамейки',city)],
 [/шезлонг[а-я]*|лежак[а-я]*/,()=>result('Шезлонги',city)],
 [/кресл[а-я]*|стул[а-я]*|стуль[а-я]*|табурет[а-я]*|пуф[а-я]*/,()=>result('Кресла и стулья',city)],
 [/стол(?:ы|ик[а-я]*)?/,()=>/теннис/.test(n)?result('Теннисные столы',sport):p.section===sport?null:p.section===child&&/пес[ко]|вод[аы]|полянка/.test(n+' '+p.sourceCategory)?result('Игры с песком и водой',child):p.section===child&&/интерактив|развива/.test(n)?result('Развивающее оборудование',child):result('Столы',city)],
 [/урн[а-я]*|пепельниц[а-я]*/,()=>result('Урны',city)],
 [/кашпо|вазон[а-я]*|цветочниц[а-я]*/,()=>result('Кашпо и вазоны',city)],
 [/велопарков[а-я]*|велостойк[а-я]*/,()=>result('Велопарковки',city)],
 [/огражден[а-я]*/,()=>result('Ограждения',city)],
 [/решетк[а-я]*/,()=>/пристволь/.test(n+' '+p.sourceCategory)?result('Приствольные решётки',city):null],
 [/арт-объект[а-я]*/,()=>result('Арт-объекты',city)],
 [/стенд[а-я]*|указател[а-я]*|портал[а-я]*/,()=>/информацион|навигац|указател/.test(head)?result('Навигация',city):null],
 [/песочниц[а-я]*/,()=>result('Игры с песком и водой',child)],
 [/домик[а-я]*/,()=>result('Игровые домики',child)],
 [/горк[а-я]*/,()=>result('Горки',child)],
 [/батут[а-я]*/,()=>result('Батуты',child)],
 [/лазалк[а-я]*|скалодром[а-я]*/,()=>p.section===sport?null:result('Лазалки и скалодромы',child)],
 [/комплекс[а-я]*|башн[а-я]*/,()=>p.section===child?result(/песочн/.test(head)?'Игры с песком и водой':/канатн/.test(head)?'Лазалки и скалодромы':'Игровые комплексы'):null],
 [/воркаут|турник[а-я]*|брусь[а-я]*|рукоход[а-я]*/,()=>result('Воркаут',sport)],
 [/тренажер[а-я]*/,()=>result('Уличные тренажёры',sport)],
 [/спинк[а-я]*|сидень[а-я]*|настил[а-я]*|подлокотник[а-я]*/,()=>p.section===city?result('Комплектующие'):null]
 ];
 const matches=rules.map(([re,get])=>{const m=new RegExp('(?:^|[\\s-])('+re.source+')(?=$|[\\s-])').exec(head);return m?{index:m.index,get}:null;}).filter(Boolean).sort((a,b)=>a.index-b.index);
 const blocker=/(?:^|\s)(?:конструкци[а-я]*|композици[а-я]*|опор[а-я]*|панел[а-я]*|платформ[а-я]*|комплект[а-я]*)/.exec(head);
 if(blocker&&matches.length&&blocker.index<matches[0].index)return null;
 return matches.length?matches[0].get():null;
}
