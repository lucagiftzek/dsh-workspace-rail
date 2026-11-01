// SPDX-License-Identifier: Apache-2.0
/**
 * Rail stylesheet. Every color comes from the host's own design tokens
 * (`--dsw-alias-*`), so the rail follows dsh's light/dark switch and any theme
 * layered on top (a theme plugin may set `--tz-*` accents, a pixel display font,
 * square corners and hard shadows); literal values are fallbacks only.
 *
 * Two placements share one ruleset:
 * - `.wr-embedded`: mounted in the sidebar's `sidebar.workspaces` seat, part of
 *   the layout: transparent, full height, Recents flexes to fill.
 * - `.wr-floating`: the legacy fixed panel (tests, and hosts without slots).
 * @module dsh-workspace-rail/rail-style
 */

const P = 'div.__dsh-workspace-rail__'
const L = 'div.__dsh-workspace-rail-launcher__'
/** dsh-session-pin footer toggle (third party, hidden: the rail lists pinned sessions). */
export const PIN_FOOTER = 'button.__dsh-session-pin-footer__'

export const RAIL_CSS = `
${P}{
  --wr-fg:var(--dsw-alias-label-primary,#e6edf3);
  --wr-fg2:var(--dsw-alias-label-secondary,#c9d1d9);
  --wr-muted:var(--dsw-alias-label-tertiary,#8b949e);
  --wr-faint:var(--dsw-alias-label-caption,#6b7686);
  --wr-line:var(--dsw-alias-border-l2,#30363d);
  --wr-line-soft:var(--dsw-alias-border-l1,#21262d);
  --wr-hover:var(--dsw-alias-interactive-bg-hover,#ffffff14);
  --wr-active:var(--dsw-alias-interactive-bg-active,#ffffff24);
  --wr-field:var(--dsw-alias-bg-layer-2,#10151b);
  --wr-raised:var(--dsw-alias-bg-layer-2,#1f2428);
  --wr-accent:var(--tz-accent,var(--dsw-alias-link,#4d93f8));
  --wr-accent-2:var(--tz-accent-2,var(--dsw-alias-link,#4d93f8));
  --wr-on-accent:var(--tz-on-accent,#fff);
  --wr-display:var(--tz-font-display,inherit);
  --wr-mono:var(--tz-font-mono,var(--ds-font-family-code,ui-monospace,monospace));
  --wr-r:var(--tz-radius,6px);
  --wr-shadow:var(--tz-shadow-pop,0 8px 24px rgba(0,0,0,.28));
  --wr-ease:var(--tz-ease,cubic-bezier(.2,.7,.3,1));
  --wr-unread:#1f6feb;
  display:flex;flex-direction:column;min-height:0;overflow:hidden;
  color:var(--wr-fg);font-size:13px;line-height:1.35;
}
${P}.wr-embedded{position:relative;flex:1 1 auto;height:100%;background:transparent;}
${P}.wr-floating{position:fixed;top:48px;left:12px;bottom:48px;width:300px;z-index:1001;
  background:var(--dsw-alias-bg-layer-1,#161b22);border:1px solid var(--wr-line);border-radius:10px;box-shadow:var(--wr-shadow);}
${L}{position:fixed;bottom:12px;left:12px;z-index:1002;padding:4px 10px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2,#30363d);background:var(--dsw-alias-bg-layer-2,#1f2428);
  color:var(--dsw-alias-label-tertiary,#8b949e);font-size:11.5px;cursor:pointer;user-select:none;}
${P} button{font:inherit;}

/* ---- head: view switch + search ---- */
${P} .wr-head{display:flex;flex-direction:column;gap:8px;padding:2px 12px 10px;flex:none;}
${P} .wr-seg{display:flex;border:1px solid var(--wr-line);border-radius:var(--wr-r);padding:2px;gap:2px;}
${P} .wr-seg button{all:unset;flex:1;text-align:center;cursor:pointer;padding:3px 0;border-radius:calc(var(--wr-r) - 2px);
  font-family:var(--wr-display);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--wr-muted);
  transition:background .15s var(--wr-ease),color .15s var(--wr-ease);}
${P} .wr-seg button:hover{color:var(--wr-fg);}
${P} .wr-seg button[aria-pressed="true"]{background:var(--wr-accent);color:var(--wr-on-accent);}
${P} .wr-searchrow{display:flex;align-items:center;gap:6px;}
${P} .wr-search{flex:1;display:flex;align-items:center;gap:6px;min-width:0;height:30px;box-sizing:border-box;padding:0 8px;
  background:var(--wr-field);border:1px solid var(--wr-line);border-radius:var(--wr-r);
  transition:border-color .15s var(--wr-ease),box-shadow .15s var(--wr-ease);}
${P} .wr-search:focus-within{border-color:var(--wr-accent);box-shadow:0 0 0 1px var(--wr-accent);}
${P} .wr-search svg{flex:none;color:var(--wr-faint);}
${P} .wr-search input{all:unset;flex:1;min-width:0;font-size:12.5px;color:var(--wr-fg);}
${P} .wr-search input::placeholder{color:var(--wr-faint);}
${P} .wr-iconbtn{all:unset;flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;
  box-sizing:border-box;border-radius:var(--wr-r);color:var(--wr-muted);cursor:pointer;}
${P} .wr-iconbtn:hover,${P} .wr-iconbtn[aria-pressed="true"]{background:var(--wr-hover);color:var(--wr-fg);}

/* ---- body + sections ---- */
${P} .wr-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;}
${P}.wr-embedded .wr-body{overflow-y:hidden;}
${P} .wr-section{padding:4px 0 6px;flex:none;}
${P}.wr-embedded .wr-section.wr-grow{flex:1 1 auto;min-height:96px;display:flex;flex-direction:column;}
${P} .wr-results:empty{display:none;}
${P} .wr-label{display:flex;align-items:center;gap:6px;padding:6px 12px 4px 14px;
  font-family:var(--wr-display);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--wr-faint);}
${P} .wr-label .wr-count{font-family:var(--wr-mono);letter-spacing:0;text-transform:none;font-size:10.5px;}
${P} .wr-label .wr-add{margin-left:auto;all:unset;margin-left:auto;cursor:pointer;color:var(--wr-faint);
  width:20px;height:18px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--wr-r);font-size:14px;}
${P} .wr-label .wr-add:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-empty{padding:4px 14px 6px;color:var(--wr-faint);font-size:12px;}

/* ---- rows ---- */
${P} .wr-row{height:32px;display:flex;align-items:center;gap:8px;margin:0 6px;padding:0 6px 0 10px;position:relative;
  white-space:nowrap;border-radius:var(--wr-r);cursor:pointer;color:var(--wr-fg2);
  transition:background .12s var(--wr-ease),color .12s var(--wr-ease);}
${P} .wr-row:hover{background:var(--wr-hover);color:var(--wr-fg);}
${P} .wr-row.wr-current{background:var(--wr-active);color:var(--wr-fg);}
${P} .wr-row.wr-current::before{content:"";position:absolute;left:0;top:7px;bottom:7px;width:2px;background:var(--wr-accent);}
${P} .wr-title{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;}
${P} .wr-icon{flex:none;display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;color:var(--wr-muted);}
${P} .wr-badge{font-size:11px;color:var(--wr-faint);flex:none;font-variant-numeric:tabular-nums;}
[data-ds-dark-theme] ${P}{--wr-unread:#4c9aff;}
/* Unread reply: a fixed-size blue dot in the row's flow (never over the time, pin or kitty). */
${P} .wr-unread{flex:none;width:7px;height:7px;border-radius:50%;background:var(--wr-unread);margin:0 1px;}
${P} .wr-time{font-family:var(--wr-mono);font-size:10.5px;color:var(--wr-faint);flex:none;font-variant-numeric:tabular-nums;}
${P} .wr-stripe{position:absolute;top:6px;bottom:6px;width:4px;}
${P}.edge-right .wr-stripe{right:0;}
${P}.edge-left .wr-stripe{left:0;}
${P} .wr-dots{all:unset;cursor:pointer;color:var(--wr-faint);flex:none;width:20px;height:22px;display:inline-flex;
  align-items:center;justify-content:center;border-radius:var(--wr-r);}
${P} .wr-row .wr-dots{opacity:0;}
${P} .wr-row:hover .wr-dots,${P} .wr-row .wr-dots[aria-expanded="true"]{opacity:1;}
${P} .wr-row:hover .wr-time{display:none;}
${P} .wr-dots:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-proj{color:var(--wr-fg);}
${P} .wr-scroller{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}
${P} .wr-vl{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;}
${P}.wr-floating .wr-vl{max-height:420px;}

/* ---- menus ---- */
${P} .wr-menu{position:absolute;right:6px;top:30px;z-index:20;background:var(--wr-raised);
  border:1px solid var(--dsw-alias-border-l3,var(--wr-line));border-radius:var(--wr-r);padding:4px;min-width:170px;box-shadow:var(--wr-shadow);}
${P} .wr-menu button{all:unset;display:block;width:100%;box-sizing:border-box;cursor:pointer;padding:6px 8px;
  border-radius:calc(var(--wr-r) - 2px);font-size:12.5px;color:var(--wr-fg);}
${P} .wr-menu button:hover{background:var(--wr-hover);}

/* ---- inline rename ---- */
${P} input.wr-rename{all:unset;flex:1;min-width:0;box-sizing:border-box;height:24px;padding:0 6px;font-size:13px;
  color:var(--wr-fg);background:var(--wr-field);border:1px solid var(--wr-accent);border-radius:var(--wr-r);cursor:text;}
${P} input.wr-rename::selection{background:color-mix(in srgb,var(--wr-accent) 40%,transparent);}
${P} input.wr-rename.wr-rename-error{border-color:var(--dsw-alias-state-error-primary,#e0685a);}
${P} .wr-row:has(input.wr-rename) .wr-time,${P} .wr-row:has(input.wr-rename) .wr-dots{display:none;}

/* ---- stripe swatch picker (inside menus) ---- */
${P} .wr-swatches{padding:6px 8px 4px;border-top:1px solid var(--wr-line-soft);margin-top:2px;}
${P} .wr-swcap{font-size:11px;color:var(--wr-muted);margin-bottom:6px;}
${P} .wr-swgrid{display:grid;grid-template-columns:repeat(9,16px);gap:5px;}
${P} .wr-menu button.wr-sw{all:unset;box-sizing:border-box;width:16px;height:16px;cursor:pointer;padding:0;
  border:1px solid color-mix(in srgb,var(--wr-fg) 18%,transparent);transition:transform .1s var(--wr-ease);}
${P} .wr-menu button.wr-sw:hover{transform:scale(1.15);background-color:inherit;}
${P} .wr-menu button.wr-sw[aria-pressed="true"]{outline:2px solid var(--wr-fg);outline-offset:1px;}
${P} .wr-menu button.wr-sw-none{background:linear-gradient(135deg,transparent 45%,var(--wr-muted) 45% 55%,transparent 55%);}

/* ---- forms ---- */
${P} .wr-form{display:flex;flex-wrap:wrap;gap:6px;padding:6px 14px 8px;}
${P} .wr-form input,${P} .wr-form select{all:unset;box-sizing:border-box;height:28px;background:var(--wr-field);
  border:1px solid var(--wr-line);border-radius:var(--wr-r);padding:0 8px;font-size:12px;color:var(--wr-fg);}
${P} .wr-form input:focus,${P} .wr-form select:focus{border-color:var(--wr-accent);}
${P} .wr-form .wr-go,${P} .wr-go{all:unset;cursor:pointer;background:var(--wr-accent);color:var(--wr-on-accent);
  border-radius:var(--wr-r);padding:0 12px;height:28px;display:inline-flex;align-items:center;font-size:12px;
  box-shadow:var(--tz-shadow-btn,none);}
${P} .wr-form .wr-cancel,${P} .wr-cancel{all:unset;cursor:pointer;border:1px solid var(--wr-line);color:var(--wr-muted);
  border-radius:var(--wr-r);padding:0 12px;height:28px;display:inline-flex;align-items:center;font-size:12px;}
${P} .wr-cancel:hover{color:var(--wr-fg);}

/* ---- search results ---- */
${P} .wr-results .wr-row{cursor:pointer;}
${P} .wr-tier{flex:none;font-family:var(--wr-mono);font-size:9.5px;font-weight:600;color:var(--wr-accent-2);
  border:1px solid var(--wr-line);border-radius:3px;padding:0 4px;line-height:15px;}

/* ---- carryover plan / config / footer ---- */
${P} .wr-plan{margin:6px 12px;border:1px solid var(--wr-line);border-radius:var(--wr-r);padding:8px 10px;background:var(--wr-field);}
${P} .wr-planhead{font-weight:600;font-size:12px;color:var(--wr-accent-2);}
${P} .wr-plannote{color:var(--wr-muted);font-size:12px;margin:4px 0;}
${P} .wr-planlist{max-height:160px;overflow-y:auto;}
${P} .wr-planrow{font-size:12px;color:var(--wr-fg);padding:1px 0;word-break:break-all;}
${P} .wr-planremove{color:var(--dsw-alias-state-error-primary,#d47b8b);}
${P} .wr-config{margin:0 12px 8px;padding:8px 10px;border:1px solid var(--wr-line);border-radius:var(--wr-r);flex:none;}
${P} .wr-cfglabel{font-size:11.5px;color:var(--wr-muted);margin-right:6px;}
${P} .wr-footer{display:flex;align-items:center;gap:8px;padding:6px 14px;border-top:1px solid var(--wr-line-soft);
  color:var(--wr-faint);font-size:11px;flex:none;font-family:var(--wr-mono);}
${P} .wr-footer .wr-dots{margin-left:auto;width:auto;padding:0 6px;font-family:inherit;}
${P} .wr-autolabel{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--wr-fg);cursor:pointer;}

/* ---- project drawer: an in-rail view, not a floating card ---- */
${P} .wr-drawer{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;overflow:hidden;
  background:var(--tz-sidebar-bg,var(--dsw-alias-bg-layer-1,#161b22));color:var(--wr-fg);
  animation:wr-in .18s var(--wr-ease);}
${P}.wr-floating .wr-drawer{border-radius:inherit;}
@keyframes wr-in{from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:none;}}
${P} .wr-drawer .wr-dhead{display:flex;align-items:center;gap:8px;padding:2px 8px 10px 6px;position:relative;
  border-bottom:1px solid var(--wr-line-soft);flex:none;}
${P} .wr-drawer .wr-dclose{all:unset;cursor:pointer;color:var(--wr-muted);width:28px;height:28px;display:inline-flex;
  align-items:center;justify-content:center;font-size:15px;border-radius:var(--wr-r);flex:none;}
${P} .wr-drawer .wr-dclose:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-pswatch{width:10px;height:10px;flex:none;}
${P} .wr-ptitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:14px;}
${P} .wr-dhead .wr-rename{height:28px;font-size:14px;}
${P} .wr-dhead .wr-menu{top:34px;}
${P} .wr-drawer .wr-dbody{flex:1;overflow-y:auto;padding:4px 0 12px;}
${P} .wr-psection{padding:8px 0 4px;}
${P} .wr-psection+.wr-psection{border-top:1px solid var(--wr-line-soft);margin-top:6px;}
${P} .wr-plabel{display:flex;align-items:center;gap:8px;padding:2px 14px 6px;font-family:var(--wr-display);font-size:10px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--wr-faint);}
${P} .wr-plabel .wr-count{font-family:var(--wr-mono);letter-spacing:0;font-size:10.5px;}
${P} .wr-pactions{display:flex;gap:6px;padding:8px 12px 2px;}
${P} .wr-pbtn{all:unset;cursor:pointer;height:28px;padding:0 10px;display:inline-flex;align-items:center;font-size:12px;
  color:var(--wr-fg2);border:1px solid var(--wr-line);border-radius:var(--wr-r);}
${P} .wr-pbtn:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-pbtn-primary{background:var(--wr-accent);border-color:var(--wr-accent);color:var(--wr-on-accent);box-shadow:var(--tz-shadow-btn,none);}
${P} .wr-pbtn-primary:hover{background:var(--wr-accent);color:var(--wr-on-accent);filter:brightness(1.08);}
${P} .wr-picker{margin:8px 12px 0;border:1px solid var(--wr-line);border-radius:var(--wr-r);background:var(--wr-field);padding:6px;}
${P} .wr-picker .wr-pfield{margin:0 0 4px;width:100%;}
${P} .wr-pickerlist{max-height:220px;overflow-y:auto;}
${P} .wr-pickitem{all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:8px;height:30px;padding:0 6px;
  cursor:pointer;border-radius:var(--wr-r);color:var(--wr-fg2);font-size:12.5px;}
${P} .wr-pickitem:hover{background:var(--wr-hover);color:var(--wr-fg);}
${P} .wr-pickplus{flex:none;color:var(--wr-accent);font-size:15px;width:14px;text-align:center;}
${P} input.wr-pfield{all:unset;box-sizing:border-box;display:block;width:calc(100% - 24px);margin:8px 12px 0;height:30px;padding:0 9px;
  font-size:12.5px;color:var(--wr-fg);background:var(--wr-field);border:1px solid var(--wr-line);border-radius:var(--wr-r);}
${P} input.wr-pfield::placeholder{color:var(--wr-faint);}
${P} input.wr-pfield:focus{border-color:var(--wr-accent);}
${P} .wr-phint{padding:4px 14px 0;font-size:11px;color:var(--wr-faint);}
${P} .wr-plink{all:unset;cursor:pointer;margin:8px 14px 0;font-size:11.5px;color:var(--dsw-alias-state-error-primary,#e0685a);display:block;}
${P} .wr-plink:hover{text-decoration:underline;}
${P} .wr-files{transition:background .12s var(--wr-ease),outline-color .12s var(--wr-ease);outline:1px dashed transparent;outline-offset:-4px;}
${P} .wr-files.wr-drop{background:color-mix(in srgb,var(--wr-accent) 8%,transparent);outline-color:var(--wr-accent);}
${P} .wr-row.wr-file{height:40px;}
${P} .wr-ficon{flex:none;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-family:var(--wr-mono);
  font-size:10px;color:var(--wr-muted);border:1px solid var(--wr-line);}
${P} .wr-ficon-data{color:var(--wr-accent-2);}
${P} .wr-ficon-snippet{color:var(--dsw-alias-state-success-primary,#4f9d69);}
${P} .wr-ficon-link{color:var(--wr-accent);}
${P} .wr-ftext{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25;}
${P} .wr-ftext .wr-title{flex:none;}
${P} .wr-fdir{font-family:var(--wr-mono);font-size:10.5px;color:var(--wr-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${P} .wr-missing .wr-title{color:var(--wr-muted);text-decoration:line-through;text-decoration-color:var(--wr-faint);}
${P} .wr-missing .wr-fdir{color:var(--dsw-alias-state-error-primary,#e0685a);}
${P} .wr-toast{position:absolute;left:10px;right:10px;bottom:40px;z-index:30;display:flex;align-items:center;gap:10px;
  padding:8px 10px;font-size:12px;background:var(--dsw-alias-bg-layer-3,#2a2523);color:var(--wr-fg);
  border:1px solid var(--wr-line);box-shadow:var(--wr-shadow);animation:wr-in .16s var(--wr-ease);}
${P} .wr-toast button{all:unset;cursor:pointer;flex:none;color:var(--wr-accent);font-weight:600;}
${P} .wr-toast button:hover{text-decoration:underline;}

/* ---- sections: fixed header, own scroll list, drag handle ---- */
${P} .wr-fold{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:inherit;letter-spacing:inherit;
  text-transform:inherit;color:inherit;}
${P} .wr-fold:hover{color:var(--wr-fg);}
${P} .wr-chev{display:inline-block;font-family:system-ui,sans-serif;font-size:10px;transition:transform .15s var(--wr-ease);}
${P} .wr-collapsed .wr-chev{transform:rotate(-90deg);}
${P} .wr-slist{overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;}
${P} .wr-section.wr-pinned,${P} .wr-section.wr-projects{padding-bottom:0;}
/* In the sidebar, Pinned/Projects give way when space is short (their lists
   shrink and scroll); Recents always keeps at least four rows. */
${P}.wr-embedded .wr-section.wr-pinned,${P}.wr-embedded .wr-section.wr-projects{flex:0 1 auto;min-height:68px;overflow:hidden;display:flex;flex-direction:column;}
${P}.wr-embedded .wr-section.wr-collapsed{min-height:0;flex:none;}
${P} .wr-section>.wr-label,${P} .wr-section>.wr-form,${P} .wr-section>.wr-resize{flex:none;}
${P}.wr-embedded .wr-slist{flex:0 1 auto;min-height:32px;}
${P}.wr-embedded .wr-section.wr-grow{flex:1 1 0;min-height:152px;}
${P}.wr-embedded .wr-config{flex:none;}
${P} .wr-recents.wr-collapsed{flex:none;min-height:0;}
${P}.wr-embedded .wr-section.wr-grow.wr-collapsed{flex:none;min-height:0;}
/* ---- section expand: one section fills the sidebar, the others keep only their header row ---- */
${P} .wr-label .wr-expand{all:unset;flex:none;box-sizing:border-box;width:18px;height:18px;margin-left:-6px;margin-right:-2px;
  display:inline-flex;align-items:center;justify-content:center;border-radius:var(--wr-r);color:var(--wr-faint);cursor:pointer;}
${P} .wr-label .wr-expand:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-label .wr-expand[aria-expanded="true"]{color:var(--wr-accent);}
${P} .wr-label .wr-expand:focus-visible,${P} .wr-fold:focus-visible{outline:1px solid var(--wr-accent);outline-offset:1px;}
${P}.wr-embedded .wr-section.wr-expanded{flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
${P} .wr-section.wr-expanded>.wr-slist{flex:1 1 auto;min-height:0;max-height:none;}
${P}.wr-floating .wr-section.wr-expanded>.wr-slist{max-height:520px;}
${P} .wr-resize{height:9px;margin:0 10px;cursor:row-resize;position:relative;touch-action:none;}
${P} .wr-resize::after{content:"";position:absolute;left:0;right:0;top:4px;height:1px;background:var(--wr-line-soft);
  transition:background .12s var(--wr-ease),height .12s var(--wr-ease),top .12s var(--wr-ease);}
${P} .wr-resize:hover::after,${P} .wr-resize.wr-dragging::after{background:var(--wr-accent);height:2px;top:3px;}
${P} .wr-resize.wr-dragging::before{content:attr(data-rows) " rows";position:absolute;right:0;top:-18px;font-family:var(--wr-mono);
  font-size:10px;color:var(--wr-on-accent);background:var(--wr-accent);padding:1px 5px;}
/* ---- drag-and-drop reorder ---- */
${P} .wr-row[draggable="true"]{-webkit-user-drag:element;}
${P} .wr-row.wr-dragsrc{opacity:.35;}
${P} .wr-row.wr-drop-before::after,${P} .wr-row.wr-drop-after::after{content:"";position:absolute;left:4px;right:4px;height:2px;background:var(--wr-accent);pointer-events:none;z-index:2;}
${P} .wr-row.wr-drop-before::after{top:-1px;}
${P} .wr-row.wr-drop-after::after{bottom:-1px;}
${P} .wr-row.wr-drop-into{background:var(--wr-active);box-shadow:inset 0 0 0 1px var(--wr-accent);}
${P} .wr-slist.wr-drop-end{box-shadow:inset 0 -2px 0 var(--wr-accent);}
${P} .wr-vl{overflow-anchor:none;}
/* ---- working indicator: pixel kitty / dots ---- */
${P} .wr-working{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--wr-accent);margin:0 2px;}
${P} .wr-kitty{position:relative;width:24px;height:12px;animation:wr-bob .36s steps(1,end) infinite;}
${P} .wr-kitty .wr-kf{position:absolute;left:0;bottom:1px;}
${P} .wr-kitty .wr-kf-a{animation:wr-fa .36s steps(1,end) infinite;}
${P} .wr-kitty .wr-kf-b{animation:wr-fb .36s steps(1,end) infinite;}
@keyframes wr-fa{0%{opacity:1}50%{opacity:0}}
@keyframes wr-fb{0%{opacity:0}50%{opacity:1}}
@keyframes wr-bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
${P} .wr-dots3{gap:3px;height:12px;}
${P} .wr-dots3 i{width:4px;height:4px;background:currentColor;display:block;animation:wr-dot 1s ease-in-out infinite;}
${P} .wr-dots3 i:nth-child(2){animation-delay:.16s;}
${P} .wr-dots3 i:nth-child(3){animation-delay:.32s;}
@keyframes wr-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@media (prefers-reduced-motion: reduce){
  ${P} .wr-kitty,${P} .wr-kitty .wr-kf-a,${P} .wr-dots3 i{animation:none;}
  ${P} .wr-kitty .wr-kf-b{display:none;}
}
/* ---- bin ---- */
${P} .wr-footer .wr-binbtn{margin-left:10px;}
${P} .wr-binrow{cursor:default;}
${P} .wr-binact{all:unset;cursor:pointer;flex:none;font-size:11.5px;padding:2px 6px;color:var(--wr-accent);border-radius:var(--wr-r);}
${P} .wr-binact:hover{background:var(--wr-hover);}
${P} .wr-bindel{color:var(--wr-faint);}
${P} .wr-bindel:hover{color:var(--dsw-alias-state-error-primary,#e0685a);}
${P} .wr-drawer .wr-phint{padding:8px 14px;}
/* ---- settings panel ---- */
${P} .wr-cfgrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px;}
${P} .wr-cfgrow .wr-cfglabel{margin:0;font-size:12px;color:var(--wr-fg2);}
${P} .wr-select{position:relative;display:inline-flex;align-items:center;}
${P} .wr-select select{all:unset;box-sizing:border-box;height:28px;min-width:92px;padding:0 28px 0 10px;font-size:12px;line-height:28px;
  color:var(--wr-fg);background:var(--wr-field);border:1px solid var(--wr-line);cursor:pointer;}
${P} .wr-select select:focus-visible{border-color:var(--wr-accent);}
${P} .wr-select::after{content:"";position:absolute;right:10px;top:50%;width:6px;height:6px;margin-top:-5px;pointer-events:none;
  border-right:1.5px solid var(--wr-muted);border-bottom:1.5px solid var(--wr-muted);transform:rotate(45deg);}
${P} .wr-select option{background:var(--dsw-alias-bg-layer-2,#221e1c);color:var(--wr-fg);}
${P} .wr-stepper{display:inline-flex;align-items:center;border:1px solid var(--wr-line);height:28px;}
${P} .wr-stepper button{all:unset;cursor:pointer;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;
  color:var(--wr-muted);font-size:14px;}
${P} .wr-stepper button:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-stepval{min-width:28px;text-align:center;font-family:var(--wr-mono);font-size:12px;color:var(--wr-fg);}
${P} .wr-config .wr-phint{padding:6px 0 0;}

/* ---- project rows (main rail): plain row + colour square, never a full tint ---- */
${P} .wr-proj{color:var(--wr-fg2);}
${P} .wr-psq{flex:none;width:9px;height:9px;margin-right:2px;}
/* ---- project view: instructions ---- */
${P} .wr-instr{padding:10px 0 6px;}
${P} .wr-instrcard{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:3px;margin:0 12px;width:calc(100% - 24px);
  padding:9px 10px;cursor:pointer;border:1px dashed var(--wr-line);color:var(--wr-fg2);}
${P} .wr-instrcard:hover{border-color:var(--wr-accent);background:var(--wr-hover);}
${P} .wr-instrhead{font-size:12.5px;font-weight:600;color:var(--wr-fg);}
${P} .wr-instrbody{font-size:12px;color:var(--wr-muted);line-height:1.4;}
${P} .wr-instrflags{font-family:var(--wr-mono);font-size:10.5px;color:var(--wr-accent-2);}
${P} .wr-instrform{padding:0 0 4px;}
${P} textarea.wr-textarea{all:unset;box-sizing:border-box;display:block;width:calc(100% - 24px);margin:0 12px 6px;min-height:120px;padding:8px 9px;
  font-size:12.5px;line-height:1.45;white-space:pre-wrap;color:var(--wr-fg);background:var(--wr-field);border:1px solid var(--wr-line);resize:vertical;}
${P} textarea.wr-textarea:focus{border-color:var(--wr-accent);}
${P} textarea.wr-textarea::placeholder{color:var(--wr-faint);}
${P} .wr-check{display:flex;gap:9px;align-items:flex-start;padding:6px 14px;cursor:pointer;}
${P} .wr-check input{margin-top:2px;accent-color:var(--wr-accent);flex:none;}
${P} .wr-check>span{display:flex;flex-direction:column;gap:2px;}
${P} .wr-checklabel{font-size:12.5px;color:var(--wr-fg);}
${P} .wr-checkhint{font-size:11px;color:var(--wr-faint);line-height:1.35;}
${P} input.wr-pfield.wr-pfield-inline{margin-top:0;}
${P} .wr-pactions-top{padding:0 12px 6px;}
${P} .wr-upload{font-weight:600;}

/* ---- archive / delete / model ---- */
${P} .wr-archtoggle{all:unset;cursor:pointer;display:block;margin:4px 6px 0;padding:4px 10px;font-size:11.5px;color:var(--wr-faint);}
${P} .wr-archtoggle:hover{color:var(--wr-fg);}
${P} .wr-row.wr-archived{opacity:.6;}
${P} .wr-confirm{margin:10px 12px 4px;padding:10px;border:1px solid var(--dsw-alias-state-error-primary,#e0685a);
  background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e0685a) 7%,transparent);display:flex;flex-direction:column;gap:4px;}
${P} .wr-confirm .wr-check{padding:6px 0 0;}
${P} .wr-confirm .wr-pactions{padding:8px 0 0;}
${P} .wr-pbtn-danger{background:var(--dsw-alias-state-error-primary,#e0685a);border-color:var(--dsw-alias-state-error-primary,#e0685a);color:#fff;}
${P} .wr-pbtn-danger:hover{filter:brightness(1.08);background:var(--dsw-alias-state-error-primary,#e0685a);color:#fff;}
${P} .wr-modelrow{display:flex;gap:6px;padding:0 12px 6px;}
${P} .wr-select-wide{flex:1;min-width:0;}
${P} .wr-select-wide select{width:100%;min-width:0;}
${P} .wr-select[hidden]{display:none;}

/* ---- collapsed sidebar (56px column) ---- */
${P}.wr-compact .wr-head,${P}.wr-compact .wr-footer,${P}.wr-compact .wr-label,${P}.wr-compact .wr-time,
${P}.wr-compact .wr-title,${P}.wr-compact .wr-dots{display:none;}

/* ---- the rail replaces the pinned-sessions footer button ----
   dsh-session-pin keeps pinning (the rail reads its pins); only its footer
   toggle is hidden. The seal status lock takes that place. */
${PIN_FOOTER}{display:none!important;}
`
