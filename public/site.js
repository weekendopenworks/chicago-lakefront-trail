const $=selector=>document.querySelector(selector);
const closeMobileMenu=({restoreFocus=false}={})=>{
 const menu=$('.mobile-menu');if(!menu?.open)return;
 const focusInMenu=menu.contains(document.activeElement);
 menu.open=false;
 if(restoreFocus&&focusInMenu)menu.querySelector('summary').focus({preventScroll:true});
};

document.addEventListener('click',event=>{
 const menu=event.target.closest('.mobile-menu');
 if(!menu||event.target.closest('a'))closeMobileMenu();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMobileMenu({restoreFocus:true})});
