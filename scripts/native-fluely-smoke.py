# Run with browser-harness on the isolated native test instance (CDP 9225).
import ctypes,json, pathlib, subprocess, time

tabs=list_tabs()
main=next(tab for tab in tabs if tab['url']=='http://tauri.localhost/')
dashboard=next(tab for tab in tabs if tab['url'].endswith('/settings'))
owned=json.loads(pathlib.Path('_research/temp/fluely-native-process.json').read_text(encoding='utf-8'))
def report():
    return json.loads(subprocess.check_output(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/inspect-windows.ps1','-ProcessId',str(owned['pid']),'-Json'],encoding='utf-8'))
def invoke(command,args=None):
    return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+((','+json.dumps(args)) if args is not None else '')+')')
def settled(predicate,timeout=10):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if predicate():return
        time.sleep(.1)
    raise AssertionError('Native/frontend state did not settle')

switch_tab(main['targetId'])
expected_version=json.loads(pathlib.Path('package.json').read_text(encoding='utf-8'))['version']
assert invoke('get_app_version')==expected_version
bindings=invoke('get_registered_shortcuts')
assert bindings['hide_all']=='ctrl+alt+h' and bindings['answer_interaction']=='shift+backslash',bindings
invoke('open_dashboard')
locale=invoke('get_system_locale')
switch_tab(dashboard['targetId'])
locale=js("localStorage.getItem('fluely.interface-language')") or locale
settled(lambda:js("document.querySelector('main header label')?.textContent")=={'en':'Settings','uk':'\u041d\u0430\u043b\u0430\u0448\u0442\u0443\u0432\u0430\u043d\u043d\u044f','ru':'\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438'}[locale])
native=next(window for window in report()['Windows'] if window['Title']=='Fluely - Dashboard')
assert 'TOOLWINDOW' in native['DecodedStyles'] and native['Visible'],native
print('settings_no_taskbar',native['DecodedStyles'])
for locale,heading in [('uk','\u041d\u0430\u043b\u0430\u0448\u0442\u0443\u0432\u0430\u043d\u043d\u044f'),('ru','\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438'),('en','Settings')]:
    js("(async()=>{localStorage.setItem('fluely.interface-language',"+json.dumps(locale)+");await window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'fluely-interface-language',payload:"+json.dumps(locale)+"});})()")
    settled(lambda:js("document.querySelector('main header label')?.textContent")==heading)
    assert js('document.documentElement.lang')==locale
print('three_languages',True)
for key,code,alpha in [('Home',36,'1'),('End',35,'0')]:
    js("document.querySelector('[role=slider]').focus()")
    cdp('Input.dispatchKeyEvent',type='keyDown',key=key,code=key,windowsVirtualKeyCode=code)
    cdp('Input.dispatchKeyEvent',type='keyUp',key=key,code=key,windowsVirtualKeyCode=code)
    settled(lambda:js("document.documentElement.style.getPropertyValue('--opacity')")==alpha)
    background=js("getComputedStyle(document.querySelector('.fluely-dashboard-canvas')).backgroundColor")
    pixel_alpha=js("(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');context.fillStyle=getComputedStyle(document.querySelector('.fluely-dashboard-canvas')).backgroundColor;context.fillRect(0,0,1,1);return context.getImageData(0,0,1,1).data[3];})()")
    assert pixel_alpha==round(float(alpha)*255),background
    assert js('getComputedStyle(document.body).backgroundColor')=='rgba(0, 0, 0, 0)'
    print('settings_alpha',background)
ctypes.windll.user32.ShowWindowAsync.argtypes=[ctypes.c_void_p,ctypes.c_int]
ctypes.windll.user32.ShowWindowAsync(ctypes.c_void_p(int(native['Handle'],16)),6)
settled(lambda:not invoke('plugin:window|is_visible',{'label':'dashboard'}))
invoke('open_dashboard')
settled(lambda:invoke('plugin:window|is_visible',{'label':'dashboard'}) and not invoke('plugin:window|is_minimized',{'label':'dashboard'}))
print('minimize_hides_and_gear_reopens',True)

switch_tab(main['targetId'])
monitors=invoke('get_layout_monitors'); monitor=monitors[0]
actions=['listen','screenshot','continuous','answer','chat','tts','mode','settings']
panels=[{'id':'free','monitor':monitor['key'],'x':monitor['x']+20,'y':monitor['y']+20,'columns':3,'gap':8,'padding':8,'button_size':36,'opacity':.25,'actions':[{'action':action,'enabled':True} for action in actions]}]
invoke('set_custom_layout',{'panels':panels})
settled(lambda:any(tab['url'].endswith('/shell/panel/free') for tab in list_tabs()))
panel=next(tab for tab in list_tabs() if tab['url'].endswith('/shell/panel/free'))
switch_tab(panel['targetId'])
settled(lambda:js("document.querySelectorAll('[data-panel-id] button').length")==8)
assert js("getComputedStyle(document.querySelector('[data-panel-id]')).gridTemplateColumns")=='36px 36px 36px'
switch_tab(main['targetId'])
invoke('move_shell_window',{'label':'panel-free','axis':'free','x':monitor['x']+180,'y':monitor['y']+100})
stored=invoke('get_shell_settings')['custom_panels'][0]
assert stored['x']==monitor['x']+180 and stored['y']==monitor['y']+100,stored
print('custom_layout_drag_persists',True)
invoke('show_answer_window')
invoke('toggle_all_windows')
assert not any(window['Visible'] for window in report()['Windows'] if window['ClassName']=='Tauri Window'),report()
assert invoke('present_answer_window') is False
invoke('set_ui_mode',{'mode':'topbottomstrips'})
invoke('toggle_all_windows')
native=report()['Windows']
for title in ['strip-top','strip-bottom','answer','Fluely - Dashboard']:
    assert next(window for window in native if window['Title']==title)['Visible'],native
restored=next(window for window in native if window['Title']=='Fluely - Dashboard')
assert 'TOOLWINDOW' in restored['DecodedStyles'] and restored['DisplayAffinity']==17,restored
print('hide_all_and_hidden_rebuild_restore',True)
invoke('set_custom_layout',{'panels':panels})
# Eight independent WebViews can take longer than the CDP helper's synchronous
# promise timeout on a busy CPU. Still require the actual command to finish.
js("window.__layoutResetDone=false;window.__layoutResetError=null;window.__TAURI_INTERNALS__.invoke('find_shell_buttons').then(()=>window.__layoutResetDone=true,error=>window.__layoutResetError=String(error));true")
settled(lambda:js('window.__layoutResetDone || !!window.__layoutResetError'),timeout=60)
assert js('window.__layoutResetError') is None
assert invoke('get_shell_settings')['ui_mode']=='buttons'
invoke('set_ui_mode',{'mode':'sidestrips'})
native=report()['Windows']
strip_size=invoke('plugin:window|outer_size',{'label':'strip-right'})
assert strip_size=={'width':int(54*monitor['scale']+.5),'height':int(186*monitor['scale']+.5)},strip_size
print('compact_geometry_and_custom_recovery',True)

size=invoke('plugin:window|outer_size',{'label':'answer'})
for x,y in [(monitor['x'],monitor['y']),(monitor['x']+monitor['width']-size['width'],monitor['y']+monitor['height']-size['height'])]:
    invoke('move_shell_window',{'label':'answer','axis':'free','x':x,'y':y})
    assert invoke('plugin:window|outer_position',{'label':'answer'})=={'x':x,'y':y}
print('chat_full_physical_workarea',True)

devices=invoke('list_microphone_devices');assert devices
invoke('start_microphone',{'deviceId':None});time.sleep(.3)
assert invoke('get_microphone_status')['active']
switch_tab(dashboard['targetId'])
denied=js("window.__TAURI_INTERNALS__.invoke('stop_microphone').then(()=>false,error=>String(error).includes('another Fluely window'))")
assert denied is True,denied
switch_tab(main['targetId']);invoke('stop_microphone')
assert not invoke('get_microphone_status')['active']
print('native_mic_owned_and_stopped',True)
status=invoke('get_identity_status')
assert status['config']['executable_alias']=='my program.exe' and status['config']['autostart'] is False,status
saved=invoke('save_identity_config',{'config':status['config']})
assert saved['metadata_patched'] and pathlib.Path(saved['managed_executable']).is_file()
print('alias_prepared_without_autostart',True)
