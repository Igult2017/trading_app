/**
 * Trade Sync — interactive surfaces, animations and accessibility.
 */
export const CT_INTERACTIONS = `
/* sidebar collapse ----------------------------------------------------*/
.ct-sidebar{width:264px;transition:width .25s ease}
.ct-sidebar.collapsed{width:76px}
.ct-sidebar-text{transition:opacity .15s ease;white-space:nowrap}
.ct-sidebar.collapsed .ct-sidebar-text,
.ct-sidebar.collapsed .ct-sidebar-label{display:none}

/* interactive surfaces ------------------------------------------------*/
.ct-nav-item{cursor:pointer;transition:background .15s ease}
.ct-nav-item:hover{background:var(--md-surface-container-high)}
.ct-nav-item.active{background:var(--md-surface-container-highest);border-right:2px solid var(--md-primary)}
.ct-source-card{cursor:pointer;transition:background .15s ease}
.ct-source-card:hover{background:var(--md-surface-variant)}
.ct-source-card.active{background:var(--md-surface-container-high);position:relative}
.ct-source-card.active::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--md-primary)}
.ct-tag-btn{cursor:pointer;transition:background .15s ease,color .15s ease}
.ct-tag-btn:hover{background:var(--md-surface-container)}
.ct-tag-btn.active{background:var(--md-surface-container-high);border-color:var(--md-outline)}
.ct-account-row{transition:background .15s ease}
.ct-account-row:hover{background:var(--md-surface-container)}
.ct-account-row{cursor:pointer}
.ct-start-btn{transition:background .15s ease,box-shadow .15s ease,opacity .15s ease}
.ct-start-btn:not(:disabled):hover{box-shadow:0 2px 8px rgba(0,0,0,.15)}
.ct-mobile-tab{cursor:pointer;position:relative;transition:color .15s ease}
.ct-mobile-tab.active::before{content:"";position:absolute;top:0;left:22%;right:22%;height:2px;background:var(--md-primary)}

/* mirror feed pulse ------------------------------------------------ */
.ct-pulse{animation:ct-pulse 1.6s ease-in-out infinite}
.ct-ping{animation:ct-ping 1.4s cubic-bezier(0,0,.2,1) infinite}
@keyframes ct-pulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes ct-ping{75%,100%{transform:scale(2);opacity:0}}
.ct-feed-row{animation:ct-slide-in .35s ease}
@keyframes ct-slide-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}

/* toast --------------------------------------------------------------*/
.ct-toast{animation:ct-toast-in .2s ease}
@keyframes ct-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

/* accessibility ------------------------------------------------------*/
.ct-app button:focus-visible,
.ct-app input:focus-visible,
.ct-app select:focus-visible,
.ct-app [tabindex]:focus-visible{
  outline:2px solid var(--md-primary);
  outline-offset:2px;
}
@media (prefers-reduced-motion: reduce){
  .ct-app *{animation-duration:.001ms !important;transition-duration:.001ms !important}
}
`;
