import * as Crypto from 'expo-crypto';

import { getSavedRoomId, saveRoomId, supabase } from '@/lib/supabase';

export type RoomSetupInput = {
  mode: 'create' | 'join' | 'login';
  inviteCode?: string;
  roomId?: string;
  name: string;
  birthday: string;
  pin: string;
};

export type RoomSetupResult = {
  roomId: string;
  inviteCode?: string;
};

async function digest(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function normalizeInviteCode(value: string) {
  return value.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
}

async function getRoomId(inviteCode: string) {
  if (!supabase) throw new Error('Supabase is not configured yet.');

  const inviteHash = await digest(normalizeInviteCode(inviteCode));
  const { data, error } = await supabase.rpc('lookup_room_id_by_invite', {
    p_invite_hash: inviteHash,
  });
  if (error) throw error;
  if (!data) throw new Error('That invite code was not found. Check it and try again.');
  return { roomId: data as string, inviteHash };
}

async function authenticate(
  roomId: string,
  name: string,
  birthday: string,
  pin: string,
  mode: RoomSetupInput['mode']
) {
  if (!supabase) throw new Error('Supabase is not configured yet.');

  const identity = await digest(`${roomId}:${name.trim().toLowerCase()}:${birthday}`);
  const email = `${identity}@privatechat.invalid`;
  const credentials = { email, password: pin };

  if (mode !== 'create') {
    const signIn = await supabase.auth.signInWithPassword(credentials);
    if (!signIn.error) return signIn.data.session;
    if (mode === 'login') throw signIn.error;

    const signUp = await supabase.auth.signUp(credentials);
    if (signUp.error) throw signIn.error;
    if (signUp.data.session) return signUp.data.session;
  } else {
    const signUp = await supabase.auth.signUp(credentials);
    if (signUp.error) throw signUp.error;
    if (signUp.data.session) return signUp.data.session;
  }

  const signIn = await supabase.auth.signInWithPassword(credentials);
  if (signIn.error) {
    throw new Error(
      'Could not complete sign-in. In Supabase, turn off email confirmation for the Email provider and try again.'
    );
  }
  return signIn.data.session;
}

export async function createOrJoinRoom(input: RoomSetupInput): Promise<RoomSetupResult> {
  if (!supabase) {
    throw new Error('Add your Supabase URL and anon key to .env before creating a private room.');
  }

  const name = input.name.trim();
  const birthday = input.birthday.trim();
  const pin = input.pin.trim();
  if (name.length < 2 || name.length > 32) {
    throw new Error('Choose a name between 2 and 32 characters.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    throw new Error('Enter your birthday in YYYY-MM-DD format.');
  }
  const parsedBirthday = new Date(`${birthday}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedBirthday.getTime()) ||
    parsedBirthday.toISOString().slice(0, 10) !== birthday ||
    parsedBirthday.getTime() > Date.now()
  ) {
    throw new Error('Enter a valid birthday that is not in the future.');
  }
  if (!/^\d{6,12}$/.test(pin)) {
    throw new Error('Your private PIN must be 6 to 12 digits.');
  }

  if (input.mode === 'create') {
    const roomId = Crypto.randomUUID();
    const inviteCode = Crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
    const inviteHash = await digest(inviteCode);
    const session = await authenticate(roomId, name, birthday, pin, 'create');
    if (!session) throw new Error('Sign-in did not return a session. Please try again.');

    const { error } = await supabase.rpc('create_couple_room', {
      p_room_id: roomId,
      p_invite_hash: inviteHash,
      p_display_name: name,
      p_birthday: birthday,
    });
    if (error) throw error;
    await saveRoomId(roomId);
    return { roomId, inviteCode };
  }

  if (input.mode === 'login') {
    const roomId = input.roomId ?? (await getSavedRoomId());
    if (!roomId) {
      throw new Error('No room is saved on this device. Join with your invite code first.');
    }

    const session = await authenticate(roomId, name, birthday, pin, 'login');
    if (!session) throw new Error('Sign-in did not return a session. Please try again.');
    const { data: member, error: memberError } = await supabase
      .from('couple_members')
      .select('room_id')
      .eq('user_id', session.user.id)
      .single();
    if (memberError) throw memberError;
    if (member.room_id !== roomId) throw new Error('This sign-in does not belong to the saved room.');
    return { roomId };
  }

  if (!input.inviteCode?.trim()) throw new Error('Enter the invite code your partner shared.');
  const { roomId, inviteHash } = await getRoomId(input.inviteCode);
  const session = await authenticate(roomId, name, birthday, pin, 'join');
  if (!session) throw new Error('Sign-in did not return a session. Please try again.');

  const { error } = await supabase.rpc('claim_couple_room', {
    p_invite_hash: inviteHash,
    p_display_name: name,
    p_birthday: birthday,
  });
  if (error) throw error;
  await saveRoomId(roomId);
  return { roomId };
}
