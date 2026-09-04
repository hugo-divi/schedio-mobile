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
 *   2. On keyboard-show, measure the focused input against this ScrollView and
 *      `scrollTo` so its bottom edge (plus `extraScrollHeight`, enough to also
 *      reveal the action beneath it) clears the keyboard. This replaced
 *      `scrollResponderScrollNativeHandleToKeyboard`, a legacy ScrollResponder
 *      method that is a silent no-op on the New Architecture — which is exactly
 *      why the auto-scroll had stopped happening.
 *
 * The scroll only ever moves to *uncover* the field: down when the keyboard
 * would cover it, up when it sits above the viewport. A field that is already
 * comfortably in view is left where it is.
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
    onScroll,
    onLayout,
    ...rest
  },
  ref
) {
  const innerRef = useRef(null);
  const retryRef = useRef(null);
  const viewportHRef = useRef(0);
  const scrollYRef = useRef(0);
  const keyboardHRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useImperativeHandle(ref, () => innerRef.current);

  const scrollToFocusedInput = useCallback(() => {
    const scroll = innerRef.current;
    if (!scroll) return;

    const focused = TextInput.State.currentlyFocusedInput?.();
    // The New Architecture returns the component instance here (it carries
    // `measureLayout`); the legacy numeric handle from `currentlyFocusedField`
    // has no way to measure against a specific ancestor, so bail rather than
    // guess.
    if (!focused || typeof focused.measureLayout !== 'function') return;

    const scrollHandle = findNodeHandle(scroll);
    if (scrollHandle == null) return;

    const viewportH = viewportHRef.current;
    if (!viewportH) return;

    focused.measureLayout(
      scrollHandle,
      (_x, y, _w, h) => {
        const kb = keyboardHRef.current;
        const current = scrollYRef.current;
        // Offset at which the input's bottom + margin would just clear the
        // keyboard. Scrolling further down than this is never needed.
        const clearBelow = y + h + extraScrollHeight - (viewportH - kb);

        if (clearBelow > current) {
          scroll.scrollTo({ y: clearBelow, animated: true });
        } else if (y - extraScrollHeight < current) {
          // Field is above the current viewport — pull it back into view.
          scroll.scrollTo({ y: Math.max(0, y - extraScrollHeight), animated: true });
        }
      },
      () => {}
    );
  }, [extraScrollHeight]);

  useEffect(() => {
    const onShow = (event) => {
      const h = event?.endCoordinates?.height ?? 0;
      keyboardHRef.current = h;
      setKeyboardHeight(h);
      // rAF lets the padding below land first; the retry catches a field that
      // is still animating in (the onboarding steps slide sideways).
      requestAnimationFrame(scrollToFocusedInput);
      clearTimeout(retryRef.current);
      retryRef.current = setTimeout(scrollToFocusedInput, 160);
    };
    const onHide = () => {
      keyboardHRef.current = 0;
      setKeyboardHeight(0);
    };

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
      scrollEventThrottle={16}
      onScroll={(event) => {
        scrollYRef.current = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      }}
      onLayout={(event) => {
        viewportHRef.current = event.nativeEvent.layout.height;
        onLayout?.(event);
      }}
      {...rest}
    >
      {children}
    </ScrollView>
  );
});

export default KeyboardAwareScrollView;
