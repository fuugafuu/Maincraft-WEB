const STORAGE_KEY = 'maincraft.settings.v1';

export const DEFAULT_CONTROLS = Object.freeze({
  forward:'KeyW', backward:'KeyS', left:'KeyA', right:'KeyD',
  jump:'Space', sneak:'ControlLeft', sprint:'ShiftLeft',
  inventory:'KeyE', chat:'KeyT', fly:'KeyF', pause:'Escape',
});

const DEFAULT_SETTINGS = Object.freeze({
  brightness: 50, renderDistance: matchMedia('(pointer: coarse)').matches ? 1 : 2,
  shadows: true, graphics: 'fancy',
  fov: 75, sensitivity: 50, controls: DEFAULT_CONTROLS,
});

function loadSettings() {
  try {
    const value=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!value || typeof value!=='object') return {...DEFAULT_SETTINGS,controls:{...DEFAULT_CONTROLS}};
    const settings={...DEFAULT_SETTINGS,...value,controls:{...DEFAULT_CONTROLS,...value.controls}};
    settings.brightness=Number.isFinite(settings.brightness)?Math.max(0,Math.min(100,settings.brightness)):50;
    settings.renderDistance=Number.isInteger(settings.renderDistance)?Math.max(1,Math.min(6,settings.renderDistance)):DEFAULT_SETTINGS.renderDistance;
    settings.fov=Number.isFinite(settings.fov)?Math.max(60,Math.min(110,settings.fov)):75;
    settings.sensitivity=Number.isFinite(settings.sensitivity)?Math.max(10,Math.min(200,settings.sensitivity)):50;
    settings.shadows=typeof settings.shadows==='boolean'?settings.shadows:true;
    settings.graphics=['fast','fancy'].includes(settings.graphics)?settings.graphics:'fancy';
    for(const [action,code] of Object.entries(settings.controls)) {
      if(typeof code!=='string'||!/^([A-Za-z0-9]+)$/.test(code)||code.length>20)settings.controls[action]=DEFAULT_CONTROLS[action];
    }
    return settings;
  }catch {return {...DEFAULT_SETTINGS,controls:{...DEFAULT_CONTROLS}}}
}

export const settings=loadSettings();
export function saveSettings(){localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}
export function resetSettings(){
  Object.assign(settings,{...DEFAULT_SETTINGS,controls:{...DEFAULT_CONTROLS}});
  saveSettings();
}

const controls=[
  ['forward','前進'],['backward','後退'],['left','左移動'],['right','右移動'],
  ['jump','ジャンプ'],['sneak','しゃがむ・下降'],['sprint','ダッシュ'],
  ['inventory','インベントリ'],['chat','チャット'],['fly','飛行切替'],['pause','メニュー'],
];
const labelForCode=code=>code.replace(/^Key/,'').replace(/^Digit/,'').replace('ShiftLeft','左Shift').replace('ControlLeft','左Ctrl').replace('Space','スペース').replace('Escape','Esc');

export function createSettingsUI(root,{onApply,onClose}){
  root.tabIndex=-1;
  root.innerHTML=`<div class="settings-card">
    <h2>設定</h2>
    <div class="settings-tabs"><button type="button" data-tab="video">ビデオ設定</button><button type="button" data-tab="controls">操作設定</button></div>
    <div data-settings-page="video" class="settings-grid">
      <label>明るさ <output id="brightness-value"></output><input id="brightness-setting" type="range" min="0" max="100" step="5"></label>
      <label>描画距離 <output id="distance-value"></output><input id="distance-setting" type="range" min="1" max="6" step="1"></label>
      <label>視野角 <output id="fov-value"></output><input id="fov-setting" type="range" min="60" max="110" step="1"></label>
      <label>グラフィックス <select id="graphics-setting"><option value="fancy">描画優先</option><option value="fast">速度優先</option></select></label>
      <label class="settings-checkbox"><input id="shadows-setting" type="checkbox">影を表示</label>
    </div>
    <div data-settings-page="controls" class="hidden">
      <label>マウス感度 <output id="sensitivity-value"></output><input id="sensitivity-setting" type="range" min="10" max="200" step="5"></label>
      <div id="key-bindings" class="settings-key-grid"></div>
      <p class="settings-hint">キーをクリックしてから、割り当てたいキーを押してください。</p>
    </div>
    <div class="settings-actions"><button type="button" id="reset-settings">初期設定に戻す</button><button type="button" id="close-settings">完了</button></div>
  </div>`;

  const $=selector=>root.querySelector(selector);
  let awaiting=null;
  function render(){
    for(const [name,setting] of [['brightness','brightness'],['distance','renderDistance'],['fov','fov'],['sensitivity','sensitivity']]){
      $(`#${name}-setting`).value=settings[setting];
      $(`#${name}-value`).textContent=settings[setting]+(name==='brightness'||name==='sensitivity'?'%':name==='distance'?' chunks':'°');
    }
    $('#graphics-setting').value=settings.graphics;
    $('#shadows-setting').checked=settings.shadows;
    $('#key-bindings').replaceChildren();
    for(const [id,label] of controls){
      const button=document.createElement('button');button.type='button';button.dataset.binding=id;
      button.textContent=`${label}  ·  ${awaiting===id?'キーを押す…':labelForCode(settings.controls[id])}`;
      button.classList.toggle('awaiting-key',awaiting===id);
      button.addEventListener('click',()=>{awaiting=id;render();root.focus()});
      $('#key-bindings').append(button);
    }
  }
  for(const [id,key] of [['brightness','brightness'],['distance','renderDistance'],['fov','fov'],['sensitivity','sensitivity']]){
    $(`#${id}-setting`).addEventListener('input',event=>{
      settings[key]=Number(event.target.value);saveSettings();onApply();render();
    });
  }
  $('#graphics-setting').addEventListener('change',event=>{settings.graphics=event.target.value;saveSettings();onApply()});
  $('#shadows-setting').addEventListener('change',event=>{settings.shadows=event.target.checked;saveSettings();onApply()});
  root.addEventListener('keydown',event=>{
    if(!awaiting)return;
    event.preventDefault();event.stopPropagation();
    if(event.code==='Escape'){awaiting=null;render();return}
    const currentAction=Object.keys(settings.controls).find(key=>settings.controls[key]===event.code);
    if(currentAction&&currentAction!==awaiting)settings.controls[currentAction]=settings.controls[awaiting];
    settings.controls[awaiting]=event.code;
    awaiting=null;saveSettings();render();
  },true);
  for(const button of root.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>{
    const page=button.dataset.tab;
    root.querySelectorAll('[data-settings-page]').forEach(element=>element.classList.toggle('hidden',element.dataset.settingsPage!==page));
    root.querySelectorAll('[data-tab]').forEach(element=>element.classList.toggle('active',element.dataset.tab===page));
  });
  root.querySelector('[data-tab="video"]').click();
  $('#reset-settings').addEventListener('click',()=>{awaiting=null;resetSettings();onApply();render()});
  $('#close-settings').addEventListener('click',()=>{awaiting=null;onClose()});
  render();
  return {render,cancelKeyCapture(){if(awaiting){awaiting=null;render()}}};
}
