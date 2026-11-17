import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ChatMessage } from '@/hooks/use-couple-chat';
import { useCoupleChat } from '@/hooks/use-couple-chat';
import { createOrJoinRoom } from '@/lib/couple-auth';
import { getSavedRoomId, isSupabaseConfigured, supabase } from '@/lib/supabase';

type SetupMode = 'create' | 'join' | 'login';
type SetupStep = 'welcome' | 'invite' | 'name' | 'birthday' | 'pin' | 'invite-ready';

const palette = {
  background: '#FAF6F2',
  surface: '#FFFFFF',
  ink: '#342C2B',
  muted: '#8D7E7C',
  accent: '#B9646D',
  accentDark: '#9E5059',
  accentLight: '#F6E4E4',
  border: '#EDE2DE',
  green: '#68A184',
  chat: '#F6F0EB',
};

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        secondary && styles.secondaryButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}>
      <Text style={[styles.primaryButtonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  maxLength,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numeric' | 'numbers-and-punctuation';
  autoCapitalize?: 'none' | 'words' | 'characters';
  maxLength?: number;
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor="#B6A9A6"
        returnKeyType={onSubmitEditing ? 'done' : 'next'}
        secureTextEntry={secureTextEntry}
        selectionColor={palette.accent}
        style={styles.textInput}
        value={value}
      />
    </View>
  );
}

function BrandHeader({ onBack }: { onBack?: () => void }) {
  return (
    <View style={styles.brandHeader}>
      {onBack ? (
        <Pressable accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.brandMark}>
          <Text style={styles.brandHeart}>♡</Text>
        </View>
      )}
      <Text style={styles.brandName}>twofold</Text>
      <View style={styles.brandMarkSmall}>
        <Text style={styles.brandHeartSmall}>♡</Text>
      </View>
    </View>
  );
}

function WelcomeScreen({
  hasSavedRoom,
  onStart,
}: {
  hasSavedRoom: boolean;
  onStart: (mode: SetupMode) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.welcomeContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <BrandHeader />
      <View style={styles.heroArtwork}>
        <View style={styles.artHalo} />
        <View style={[styles.artCircle, styles.artCircleLeft]}>
          <Text style={styles.artInitial}>Y</Text>
        </View>
        <View style={styles.artCircleRight}>
          <Text style={styles.artInitial}>♡</Text>
        </View>
        <View style={styles.artSparkle}>
          <Text style={styles.sparkleText}>✦</Text>
        </View>
      </View>

      <View style={styles.welcomeCopy}>
        <Text style={styles.eyebrow}>A PRIVATE SPACE FOR TWO</Text>
        <Text style={styles.heroTitle}>A little space{'\n'}for just us.</Text>
        <Text style={styles.heroSubtitle}>
          Your own quiet corner to share the little things, wherever you are.
        </Text>
      </View>

      {!isSupabaseConfigured ? (
        <View style={styles.setupNotice}>
          <Text style={styles.noticeTitle}>Connect your Supabase project</Text>
          <Text style={styles.noticeText}>
            Add the project URL and publishable key to .env, then run the SQL in supabase/schema.sql.
          </Text>
        </View>
      ) : null}

      <View style={styles.welcomeActions}>
        <PrimaryButton label="Create our space" onPress={() => onStart('create')} />
        <PrimaryButton
          label="I have an invite code"
          onPress={() => onStart('join')}
          secondary
        />
        {hasSavedRoom ? (
          <Pressable onPress={() => onStart('login')} style={styles.signInButton}>
            <Text style={styles.openChatText}>Sign in to our space</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.privacyFootnote}>Just the two of you. Always.</Text>
    </ScrollView>
  );
}

function SetupScreen({
  step,
  mode,
  inviteCode,
  name,
  birthday,
  pin,
  error,
  busy,
  onBack,
  onInviteChange,
  onNameChange,
  onBirthdayChange,
  onPinChange,
  onContinue,
}: {
  step: Exclude<SetupStep, 'welcome' | 'invite-ready'>;
  mode: SetupMode;
  inviteCode: string;
  name: string;
  birthday: string;
  pin: string;
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onInviteChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onBirthdayChange: (value: string) => void;
  onPinChange: (value: string) => void;
  onContinue: () => void;
}) {
  const steps = ['name', 'birthday', 'pin'] as const;
  const stepIndex = steps.indexOf(step as (typeof steps)[number]);
  const titles = {
    invite: 'Your invite code',
    name: 'What should we call you?',
    birthday: 'When is your birthday?',
    pin: mode === 'login' ? 'Enter your private PIN' : 'Choose a private PIN',
  };
  const descriptions = {
    invite: 'Enter the invite code your person shared with you.',
    name: 'Pick the name your person will see in your chat.',
    birthday: 'This helps make your private sign-in yours.',
    pin:
      mode === 'login'
        ? 'Use the 6 to 12 digit PIN you chose when you joined.'
        : 'Use 6 to 12 digits. You’ll use it to sign in again.',
  };
  const field =
    step === 'invite' ? (
      <FormField
        autoCapitalize="characters"
        label="INVITE CODE"
        maxLength={20}
        onChangeText={onInviteChange}
        placeholder="Paste your 20-character code"
        value={inviteCode}
      />
    ) : step === 'name' ? (
      <FormField
        autoCapitalize="words"
        label="YOUR NAME"
        maxLength={32}
        onChangeText={onNameChange}
        placeholder="The name they know you by"
        value={name}
      />
    ) : step === 'birthday' ? (
      <FormField
        keyboardType="numbers-and-punctuation"
        label="BIRTHDAY"
        maxLength={10}
        onChangeText={onBirthdayChange}
        placeholder="YYYY-MM-DD"
        value={birthday}
      />
    ) : (
      <FormField
        keyboardType="numeric"
        label="PRIVATE PIN"
        maxLength={12}
        onChangeText={onPinChange}
        placeholder="At least 6 digits"
        secureTextEntry
        value={pin}
      />
    );

  const buttonLabel =
    step === 'pin' ? (mode === 'login' ? 'Sign in' : 'Open our space') : 'Continue';

  return (
    <ScrollView
      contentContainerStyle={styles.setupContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <BrandHeader onBack={onBack} />
      <View style={styles.progressRow}>
        {steps.map((item, index) => (
          <View
            key={item}
            style={[styles.progressTrack, index <= stepIndex && styles.progressTrackActive]}
          />
        ))}
      </View>
      <Text style={styles.stepLabel}>
        {step === 'invite' ? 'PAIRING' : `STEP ${stepIndex + 1} OF 3`}
      </Text>
      <Text style={styles.setupTitle}>{titles[step]}</Text>
      <Text style={styles.setupDescription}>{descriptions[step]}</Text>
      <View style={styles.formCard}>
        {field}
        {step === 'birthday' ? (
          <Text style={styles.birthdayHint}>Your birthday stays visible only to you two.</Text>
        ) : null}
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <PrimaryButton
        disabled={busy}
        label={busy ? 'Setting things up…' : buttonLabel}
        onPress={onContinue}
      />
      <Text style={styles.modeFootnote}>
        {mode === 'create'
          ? 'Your PIN is protected by Supabase Auth.'
          : mode === 'join'
            ? 'Your invite code is used only to find your shared room.'
            : 'Your saved room lets you sign in without the invite code.'}
      </Text>
    </ScrollView>
  );
}

function InviteReadyScreen({
  code,
  onShare,
  onOpenChat,
}: {
  code: string;
  onShare: () => void;
  onOpenChat: () => void;
}) {
  return (
    <View style={styles.inviteReadyContent}>
      <BrandHeader />
      <View style={styles.inviteHeart}>
        <Text style={styles.inviteHeartText}>♡</Text>
      </View>
      <Text style={styles.eyebrow}>YOUR SPACE IS READY</Text>
      <Text style={styles.inviteTitle}>Now invite{'\n'}your person.</Text>
      <Text style={styles.inviteSubtitle}>
        Share this private code with just one person so they can join your room.
      </Text>
      <View style={styles.codeCard}>
        <Text selectable style={styles.inviteCode}>
          {code.match(/.{1,5}/g)?.join(' ') ?? code}
        </Text>
        <Text style={styles.codeCaption}>PRIVATE ROOM INVITE</Text>
      </View>
      <PrimaryButton label="Share invite code" onPress={onShare} />
      <Pressable onPress={onOpenChat} style={styles.openChatButton}>
        <Text style={styles.openChatText}>Go to our chat</Text>
      </Pressable>
    </View>
  );
}

function MessageBubble({
  item,
  mine,
  read,
}: {
  item: ChatMessage;
  mine: boolean;
  read: boolean;
}) {
  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
      <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleTheirs]}>
        {item.imageUrl ? (
          <Image
            accessibilityLabel="Shared image"
            contentFit="cover"
            source={{ uri: item.imageUrl }}
            style={styles.messageImage}
          />
        ) : null}
        {item.content ? (
          <Text style={[styles.messageText, mine && styles.messageTextMine]}>{item.content}</Text>
        ) : null}
        <View style={styles.messageMeta}>
          <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
          {mine ? (
            <Text style={[styles.receiptText, read && styles.receiptRead]}>
              {read ? 'Read' : 'Sent'}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ChatScreen({
  chat,
  session,
  onSignOut,
}: {
  chat: ReturnType<typeof useCoupleChat>;
  session: Session;
  onSignOut: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const { sendTyping } = chat;
  const partnerName = chat.partner?.display_name ?? 'Your person';

  useEffect(() => {
    if (!draft.trim()) {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = null;
      lastTypingSent.current = 0;
      void sendTyping(false);
      return;
    }

    if (Date.now() - lastTypingSent.current > 1800) {
      lastTypingSent.current = Date.now();
      void sendTyping(true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      lastTypingSent.current = 0;
      void sendTyping(false);
    }, 1400);

    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [draft, sendTyping]);

  const send = async () => {
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft('');
    setSending(true);
    setError(null);
    try {
      await chat.sendText(text);
    } catch (cause) {
      setDraft(text);
      setError(cause instanceof Error ? cause.message : 'Your message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const selectImage = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to share an image in your chat.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.82,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        setError('Choose an image smaller than 10 MB.');
        return;
      }
      const mimeType = asset.mimeType ?? 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(mimeType)) {
        setError('Choose a JPEG, PNG, WebP, or HEIC image.');
        return;
      }

      setSending(true);
      setError(null);
      await chat.sendImage(asset.uri, mimeType);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your image could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.chatSafeArea}>
      <StatusBar style="dark" />
      <View style={styles.chatHeader}>
        <View style={styles.chatAvatar}>
          <Text style={styles.chatAvatarText}>{partnerName.slice(0, 1).toUpperCase()}</Text>
          {chat.partnerOnline ? <View style={styles.onlineDot} /> : null}
        </View>
        <View style={styles.chatHeaderCopy}>
          <Text style={styles.chatPartnerName}>{partnerName}</Text>
          <Text style={styles.chatStatus}>
            {chat.partnerTyping
              ? 'typing…'
              : chat.partnerOnline
                ? 'online now'
                : chat.partner
                  ? 'your private space'
                  : 'waiting for your person'}
          </Text>
        </View>
        <Pressable accessibilityLabel="Sign out" onPress={onSignOut} style={styles.lockButton}>
          <Text style={styles.lockIcon}>↗</Text>
        </Pressable>
      </View>

      <View style={styles.chatBanner}>
        <Text style={styles.chatBannerHeart}>♡</Text>
        <Text style={styles.chatBannerText}>Just between the two of you</Text>
      </View>

      {chat.loading ? (
        <View style={styles.chatLoading}>
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messageList}
          data={chat.messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatHeart}>♡</Text>
              <Text style={styles.emptyChatTitle}>Your story starts here.</Text>
              <Text style={styles.emptyChatCopy}>Send a little hello to get things going.</Text>
            </View>
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <MessageBubble
              item={item}
              mine={item.sender_id === session.user.id}
              read={
                item.sender_id === session.user.id &&
                Boolean(
                  chat.partner?.last_read_at &&
                    new Date(chat.partner.last_read_at).getTime() >=
                      new Date(item.created_at).getTime()
                )
              }
            />
          )}
        />
      )}

      {chat.error || error ? (
        <Pressable
          onPress={() => {
            chat.setError(null);
            setError(null);
          }}
          style={styles.chatError}>
          <Text style={styles.chatErrorText}>{error ?? chat.error}</Text>
          <Text style={styles.errorDismiss}>×</Text>
        </Pressable>
      ) : null}
      {chat.partnerTyping ? (
        <Text style={styles.typingLabel}>{partnerName} is typing…</Text>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <Pressable
            accessibilityLabel="Share an image"
            disabled={sending}
            onPress={() => void selectImage()}
            style={styles.photoButton}>
            <Text style={styles.photoButtonText}>＋</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="Message"
            multiline
            onChangeText={setDraft}
            onSubmitEditing={() => void send()}
            placeholder="Write something sweet…"
            placeholderTextColor="#AA9B98"
            returnKeyType="send"
            style={styles.composerInput}
            value={draft}
          />
          <Pressable
            accessibilityLabel="Send message"
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}>
            <Text style={styles.sendButtonText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function TwofoldApp() {
  const [step, setStep] = useState<SetupStep>('welcome');
  const [mode, setMode] = useState<SetupMode>('create');
  const [inviteCode, setInviteCode] = useState('');
  const [pendingInvite, setPendingInvite] = useState('');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [pin, setPin] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [savedRoomId, setSavedRoomId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const chat = useCoupleChat(session, authLoading || authBusy);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setAuthError(error.message);
        setSession(data.session);
      })
      .catch((cause: unknown) => {
        if (active) setAuthError(cause instanceof Error ? cause.message : 'Could not restore sign-in.');
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    getSavedRoomId()
      .then((roomId) => {
        if (active) setSavedRoomId(roomId);
      })
      .catch((cause: unknown) => {
        if (active) {
          setAuthError(
            cause instanceof Error ? cause.message : 'Could not load your saved private room.'
          );
        }
      });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [restoreAttempt]);

  const back = () => {
    setFormError(null);
    if (step === 'invite') setStep('welcome');
    else if (step === 'name') setStep(mode === 'join' ? 'invite' : 'welcome');
    else if (step === 'birthday') setStep('name');
    else if (step === 'pin') setStep('birthday');
  };

  const continueSetup = async () => {
    setFormError(null);
    if (step === 'invite') {
      if (!inviteCode.trim()) {
        setFormError('Enter the invite code your partner shared.');
        return;
      }
      setInviteCode(inviteCode.trim().toUpperCase());
      setStep('name');
      return;
    }
    if (step === 'name') {
      if (name.trim().length < 2) {
        setFormError('Choose a name with at least 2 characters.');
        return;
      }
      setStep('birthday');
      return;
    }
    if (step === 'birthday') {
      setStep('pin');
      return;
    }
    if (step !== 'pin') return;

    if (!supabase) {
      setFormError('Add your Supabase URL and publishable key to .env before signing in.');
      return;
    }
    setAuthBusy(true);
    setFormError(null);
    try {
      const result = await createOrJoinRoom({
        mode,
        inviteCode,
        name,
        birthday,
        pin,
      });
      setSavedRoomId(result.roomId);
      if (result.inviteCode) {
        setPendingInvite(result.inviteCode);
        setStep('invite-ready');
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSession(data.session);
      setName('');
      setBirthday('');
      setPin('');
      setInviteCode('');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not open your private space.');
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      chat.setError(error.message);
      return;
    }
    setSession(null);
    setStep('welcome');
    setName('');
    setBirthday('');
    setPin('');
    setInviteCode('');
    setFormError(null);
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="dark" />
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Opening your space…</Text>
      </SafeAreaView>
    );
  }

  if (authError && !session) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="dark" />
        <Text style={styles.errorTitle}>Couldn’t restore your sign-in</Text>
        <Text style={styles.errorText}>{authError}</Text>
        <PrimaryButton
          label="Try again"
          onPress={() => {
            setAuthError(null);
            setAuthLoading(true);
            setRestoreAttempt((attempt) => attempt + 1);
          }}
        />
      </SafeAreaView>
    );
  }

  if (session && step === 'invite-ready') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <StatusBar style="dark" />
        <StatusBar style="dark" />
        <InviteReadyScreen
          code={pendingInvite}
          onOpenChat={() => setStep('welcome')}
          onShare={() =>
            void Share.share({
              message: `Join my private Twofold chat with this invite code: ${pendingInvite}`,
            })
          }
        />
      </SafeAreaView>
    );
  }

  if (session) {
    if (authBusy || chat.loading || !chat.member) {
      return (
        <SafeAreaView style={styles.loadingScreen}>
          <StatusBar style="dark" />
          {chat.loading ? <ActivityIndicator color={palette.accent} size="large" /> : null}
          <Text style={styles.loadingText}>
            {chat.error ??
              (authBusy
                ? 'Finishing setup…'
                : chat.loading
                  ? 'Opening your space…'
                  : 'Your private room is not ready.')}
          </Text>
          {chat.error ? <PrimaryButton label="Sign out" onPress={() => void signOut()} /> : null}
        </SafeAreaView>
      );
    }
    return <ChatScreen chat={chat} onSignOut={() => void signOut()} session={session} />;
  }

  const startSetup = (nextMode: SetupMode) => {
    setMode(nextMode);
    setFormError(null);
    setStep(nextMode === 'join' ? 'invite' : 'name');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      {step === 'welcome' ? (
        <WelcomeScreen hasSavedRoom={Boolean(savedRoomId)} onStart={startSetup} />
      ) : (
        <SetupScreen
          birthday={birthday}
          busy={authBusy}
          error={formError}
          inviteCode={inviteCode}
          mode={mode}
          name={name}
          onBack={back}
          onBirthdayChange={setBirthday}
          onContinue={() => void continueSetup()}
          onInviteChange={setInviteCode}
          onNameChange={setName}
          onPinChange={setPin}
          pin={pin}
          step={step as Exclude<SetupStep, 'welcome' | 'invite-ready'>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: palette.background,
    padding: 28,
  },
  loadingText: {
    color: palette.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  errorTitle: {
    color: palette.ink,
    fontFamily: 'Georgia',
    fontSize: 26,
    textAlign: 'center',
  },
  errorText: {
    color: palette.accentDark,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  welcomeContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  brandHeader: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMark: {
    position: 'absolute',
    left: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandHeart: {
    color: palette.accent,
    fontSize: 23,
    lineHeight: 27,
  },
  brandName: {
    color: palette.ink,
    fontFamily: 'Georgia',
    fontSize: 24,
    letterSpacing: 0.2,
  },
  brandMarkSmall: {
    position: 'absolute',
    right: 0,
  },
  brandHeartSmall: {
    color: palette.accent,
    fontSize: 22,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: palette.ink,
    fontSize: 38,
    lineHeight: 42,
  },
  heroArtwork: {
    width: 218,
    height: 194,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artHalo: {
    width: 174,
    height: 174,
    borderRadius: 87,
    position: 'absolute',
    backgroundColor: '#F3E4DF',
  },
  artCircle: {
    width: 96,
    height: 96,
    position: 'absolute',
    left: 30,
    top: 50,
    borderRadius: 48,
    backgroundColor: '#D5A5A2',
    borderWidth: 7,
    borderColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artCircleLeft: {
    zIndex: 1,
  },
  artCircleRight: {
    width: 96,
    height: 96,
    position: 'absolute',
    right: 30,
    top: 50,
    borderRadius: 48,
    backgroundColor: '#E8C8B3',
    borderWidth: 7,
    borderColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artInitial: {
    color: '#FFFFFF',
    fontFamily: 'Georgia',
    fontSize: 31,
  },
  artSparkle: {
    position: 'absolute',
    right: 13,
    top: 24,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleText: {
    color: palette.accent,
    fontSize: 18,
  },
  welcomeCopy: {
    alignItems: 'center',
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  heroTitle: {
    marginTop: 13,
    color: palette.ink,
    fontFamily: 'Georgia',
    fontSize: 40,
    lineHeight: 47,
    textAlign: 'center',
  },
  heroSubtitle: {
    maxWidth: 300,
    marginTop: 12,
    color: palette.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  welcomeActions: {
    width: '100%',
    gap: 11,
    marginTop: 26,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#F2E9E4',
  },
  secondaryButtonText: {
    color: palette.ink,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  privacyFootnote: {
    marginTop: 18,
    color: palette.muted,
    fontSize: 12,
  },
  setupNotice: {
    width: '100%',
    marginTop: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EAC9C3',
    borderRadius: 14,
    backgroundColor: '#FFF8F5',
  },
  noticeTitle: {
    color: palette.accentDark,
    fontSize: 13,
    fontWeight: '700',
  },
  noticeText: {
    marginTop: 5,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  setupContent: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingBottom: 32,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 30,
  },
  progressTrack: {
    height: 4,
    flex: 1,
    borderRadius: 4,
    backgroundColor: '#E9DEDA',
  },
  progressTrackActive: {
    backgroundColor: palette.accent,
  },
  stepLabel: {
    marginTop: 34,
    color: palette.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  setupTitle: {
    marginTop: 12,
    color: palette.ink,
    fontFamily: 'Georgia',
    fontSize: 31,
    lineHeight: 38,
  },
  setupDescription: {
    marginTop: 8,
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  formCard: {
    marginTop: 27,
    padding: 17,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 17,
    backgroundColor: palette.surface,
  },
  fieldGroup: {
    gap: 9,
  },
  fieldLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  textInput: {
    minHeight: 46,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 11,
    color: palette.ink,
    fontSize: 15,
    backgroundColor: '#FFFCFA',
  },
  birthdayHint: {
    marginTop: 12,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  errorBanner: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FCE9E8',
  },
  modeFootnote: {
    marginTop: 15,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  inviteReadyContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 2,
    paddingBottom: 24,
  },
  inviteHeart: {
    width: 78,
    height: 78,
    marginTop: 28,
    marginBottom: 21,
    borderRadius: 39,
    backgroundColor: palette.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteHeartText: {
    color: palette.accent,
    fontSize: 42,
    lineHeight: 48,
  },
  inviteTitle: {
    marginTop: 11,
    color: palette.ink,
    fontFamily: 'Georgia',
    fontSize: 36,
    lineHeight: 43,
    textAlign: 'center',
  },
  inviteSubtitle: {
    maxWidth: 300,
    marginTop: 12,
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  codeCard: {
    width: '100%',
    marginTop: 24,
    marginBottom: 17,
    paddingVertical: 19,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 15,
    backgroundColor: palette.surface,
    alignItems: 'center',
    gap: 9,
  },
  inviteCode: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  codeCaption: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  openChatButton: {
    padding: 16,
  },
  signInButton: {
    alignItems: 'center',
    padding: 12,
  },
  openChatText: {
    color: palette.accentDark,
    fontSize: 14,
    fontWeight: '700',
  },
  chatSafeArea: {
    flex: 1,
    backgroundColor: palette.chat,
  },
  chatHeader: {
    minHeight: 69,
    paddingHorizontal: 19,
    borderBottomWidth: 1,
    borderBottomColor: '#E9DFDA',
    backgroundColor: palette.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chatAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E9CEC5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatAvatarText: {
    color: palette.accentDark,
    fontFamily: 'Georgia',
    fontSize: 21,
  },
  onlineDot: {
    position: 'absolute',
    width: 11,
    height: 11,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: palette.background,
    borderRadius: 6,
    backgroundColor: palette.green,
  },
  chatHeaderCopy: {
    flex: 1,
  },
  chatPartnerName: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  chatStatus: {
    marginTop: 2,
    color: palette.muted,
    fontSize: 12,
  },
  lockButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F2E9E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    color: palette.accentDark,
    fontSize: 19,
    fontWeight: '700',
  },
  chatBanner: {
    minHeight: 35,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  chatBannerHeart: {
    color: palette.accent,
    fontSize: 15,
  },
  chatBannerText: {
    color: palette.muted,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  messageList: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginVertical: 4,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '84%',
    minWidth: 74,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 7,
  },
  messageBubbleTheirs: {
    borderBottomLeftRadius: 5,
    backgroundColor: palette.surface,
  },
  messageBubbleMine: {
    borderBottomRightRadius: 5,
    backgroundColor: palette.accent,
  },
  messageImage: {
    width: 220,
    height: 190,
    marginBottom: 4,
    borderRadius: 12,
    backgroundColor: '#EDE2DE',
  },
  messageText: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextMine: {
    color: '#FFFFFF',
  },
  messageMeta: {
    minHeight: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 7,
    marginTop: 3,
  },
  messageTime: {
    color: palette.muted,
    fontSize: 9,
  },
  messageTimeMine: {
    color: '#F4DDE0',
  },
  receiptText: {
    color: '#F4DDE0',
    fontSize: 9,
    fontWeight: '600',
  },
  receiptRead: {
    color: '#FFFFFF',
  },
  emptyChat: {
    alignItems: 'center',
    paddingVertical: 58,
  },
  emptyChatHeart: {
    color: '#D69A9A',
    fontSize: 36,
  },
  emptyChatTitle: {
    marginTop: 10,
    color: palette.ink,
    fontFamily: 'Georgia',
    fontSize: 22,
  },
  emptyChatCopy: {
    marginTop: 6,
    color: palette.muted,
    fontSize: 13,
  },
  chatLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatError: {
    marginHorizontal: 12,
    marginBottom: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#FCE9E8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatErrorText: {
    flex: 1,
    color: '#974E50',
    fontSize: 12,
    lineHeight: 17,
  },
  errorDismiss: {
    paddingHorizontal: 6,
    color: '#974E50',
    fontSize: 20,
  },
  typingLabel: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    color: palette.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  composer: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E9DFDA',
    backgroundColor: palette.background,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
  },
  photoButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2E9E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtonText: {
    color: palette.accentDark,
    fontSize: 27,
    lineHeight: 31,
  },
  composerInput: {
    maxHeight: 110,
    minHeight: 40,
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F1E9E4',
    color: palette.ink,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#D9C6C3',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 28,
  },
});
