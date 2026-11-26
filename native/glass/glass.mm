#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#include <node_api.h>
// Electron's handle is an NSView*. Keep the effect behind Chromium, never above it.
static napi_value update(napi_env env, napi_callback_info info) {
  size_t count = 7; napi_value args[7]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if(count != 7) { napi_throw_type_error(env,nullptr,"Expected handle, x, y, width, height, dark, radius"); return nullptr; }
  void *bytes; size_t length;
  if(napi_get_buffer_info(env,args[0],&bytes,&length)!=napi_ok || length!=sizeof(void*)) { napi_throw_type_error(env,nullptr,"Invalid native handle"); return nullptr; }
  NSView *view = (__bridge NSView *)*(void **)bytes;
  double values[5];
  for(int i=0;i<4;i++) napi_get_value_double(env,args[i+1],&values[i]);
  napi_get_value_double(env,args[6],&values[4]);
  bool dark; napi_get_value_bool(env,args[5],&dark);
  NSView *host = view.superview;
  NSVisualEffectView *glass = nil;
  for(NSView *child in host.subviews) if(child.identifier && [child.identifier isEqualToString:@"j7-glass"]) { glass=(NSVisualEffectView *)child; break; }
  if(!glass) {
    glass = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
    glass.identifier = @"j7-glass";
    glass.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    glass.material = NSVisualEffectMaterialHUDWindow;
    glass.state = NSVisualEffectStateActive;
    glass.wantsLayer = YES; glass.layer.masksToBounds = YES;
    [host addSubview:glass positioned:NSWindowBelow relativeTo:view];
  }
  glass.appearance = [NSAppearance appearanceNamed:dark ? NSAppearanceNameVibrantDark : NSAppearanceNameVibrantLight];
  NSRect rect = NSMakeRect(values[0], view.isFlipped ? values[1] : view.bounds.size.height-values[1]-values[3], values[2], values[3]);
  glass.frame = [view convertRect:rect toView:host];
  glass.layer.cornerRadius = values[4];
  napi_value result; napi_get_undefined(env,&result); return result;
}
NAPI_MODULE_INIT() {
  napi_value fn; napi_create_function(env,"update",NAPI_AUTO_LENGTH,update,nullptr,&fn);
  napi_set_named_property(env,exports,"update",fn); return exports;
}
