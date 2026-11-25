import {sportType} from './classify-sports.mjs';
export function requestedCategory(p){
 const n=(p.name||'').toLowerCase().replace(/ё/g,'е'),s=(p.sourceCategory||'').toLowerCase().replace(/ё/g,'е');
 const sports=sportType(p);if(sports)return sports;
 const dog=/собак|собач|аджилити|agility/.test(s)||/для собак|собачьих площад|равновесия собак/.test(n);
 if(dog)return {section:'Другие изделия',category:'Площадки для собак'};
 if((p.category==='Навесы, перголы и остановки'||p.category==='Велопарковки')&&/велопарк|велосипед|велостойк|велопоруч/.test(n+' '+s))return {section:'Городская мебель',category:'Велопарковки'};
 const shelter=/навес|веранд|беседк/.test(n.split(/[«"“(]/)[0].split(/\s(?:с|со|для|из|на|под|без)\s/)[0]);
 const children=/детск.*(?:оборуд|площад|игров)|игровое оборудование|теневые навесы|навесы и веранды/.test(s)||p.section==='Детское оборудование'||/детская беседка|для детского сада|детская веранда/.test(n);
 if(shelter&&children&&!/для колясок/.test(n))return {section:'Детское оборудование',category:'Навесы и веранды'};
 return null;
}
