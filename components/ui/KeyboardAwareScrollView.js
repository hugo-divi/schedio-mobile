import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, Keyboard, Platform, TextInput, findNodeHandle } from 'react-native';

const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/**
 * A ScrollView that keeps the focused field — and whatever sits right under it,
 * usually the submit button — clear of the keyboard.
 *
 * Why this exists: every form screen used
 * `<KeyboardAvoidingView behavior={ios ? 'padding' : undefined}>`, i.e. it left
 * Android to the activity's own `adjustResize`. Under Expo's edge-to-edge that
 * resize no longer shrinks the JS layout, so on Android the keyboard just
 * covered the bottom of the form (the "Crear cuenta" button behind the second
 * password field, the onboarding grade field, the session notes…). Even where
 * the resize did fire, a plain ScrollView never scrolls a focused input into
 * view on Android.
 *
 * Two things together fix it, neither relying on the native resize:
 *   1. `paddingBottom: keyboardHeight` on the content, so there is somewhere to
 *      scroll the button *to*.
 *   2. `scrollResponderScrollNativeHandleToKeyboard`, the same mechanism
 *      react-native-keyboard-aware-scroll-view uses, to bring the focused node
 *      `extraScrollHeight` px above the keyboard — enough to also reveal the
 *      action directly beneath it.
 *
 * Drop-in for the ScrollView inside those `KeyboardAvoidingView`s; the wrapper
 * itself is no longer needed.
 */
const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  {
    children,
    contentContainerStyle,
    keyboardShouldPersistTaps = 'handled',
    extraScrollHeight = 96,
    ...rest
  },
  ref
) {
  const innerRef = useRef(null);
  const retryRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useImperativeHandle(ref, () => innerRef.current);

  const scrollToFocusedInput = useCallback(() => {
    const scroll = innerRef.current;
    if (!scroll) return;

    const focused =
      TextInput.State.currentlyFocusedInput?.() ?? TextInput.State.currentlyFocusedField?.();
    if (!focused) return;

    const handle = typeof focused === 'number' ? focused : findNodeHandle(focused);
    if (handle == null) return;

    const responder = scroll.getScrollResponder ? scroll.getScrollResponder() : scroll;
    responder?.scrollResponderScrollNativeHandleToKeyboard?.(handle, extraScrollHeight, true);
  }, [extraScrollHeight]);

  useEffect(() => {
    const onShow = (event) => {
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
      // rAF lets the padding below land first; the retry catches a field that
      // is still animating in (the onboarding steps slide sideways).
      requestAnimationFrame(scrollToFocusedInput);
      clearTimeout(retryRef.current);
      retryRef.current = setTimeout(scrollToFocusedInput, 160);
    };
    const onHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener(SHOW_EVENT, onShow);
    const hideSub = Keyboard.addListener(HIDE_EVENT, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
      clearTimeout(retryRef.current);
    };
  }, [scrollToFocusedInput]);

  return (
    <ScrollView
      ref={innerRef}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={[contentContainerStyle, { paddingBottom: keyboardHeight }]}
      // A field near the bottom of a long form can still need a nudge from the
      // scroll ScrollResponder does after this line.
      scrollEventThrottle={16}
      {...rest}
    >
      {children}
    </ScrollView>
  );
});

export default KeyboardAwareScrollView;
