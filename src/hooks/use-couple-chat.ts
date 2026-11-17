import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

export type CoupleMember = {
  user_id: string;
  room_id: string;
  display_name: string;
  birthday: string;
  last_read_at: string;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  image_path: string | null;
  created_at: string;
  imageUrl?: string;
};

type PresenceEntry = {
  presence_ref: string;
  user_id?: string;
};

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime()
  );
}

export function useCoupleChat(session: Session | null, paused: boolean) {
  const [member, setMember] = useState<CoupleMember | null>(null);
  const [partner, setPartner] = useState<CoupleMember | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastReadTargetRef = useRef<string | null>(null);
  const partnerRef = useRef<CoupleMember | null>(null);
  const [loadedSessionKey, setLoadedSessionKey] = useState<string | null>(null);
  const sessionKey = session ? `${session.user.id}:${session.access_token}` : null;

  useEffect(() => {
    if (!supabase || !session || paused) {
      return;
    }

    const client = supabase;
    let active = true;
    let channel: RealtimeChannel | null = null;
    lastReadTargetRef.current = null;

    const loadChat = async () => {
      const { data: ownMember, error: memberError } = await client
        .from('couple_members')
        .select('user_id, room_id, display_name, birthday, last_read_at')
        .eq('user_id', session.user.id)
        .single();
      if (memberError) throw memberError;
      if (!active) return;

      const { data: partnerMember, error: partnerError } = await client
        .from('couple_members')
        .select('user_id, room_id, display_name, birthday, last_read_at')
        .eq('room_id', ownMember.room_id)
        .neq('user_id', session.user.id)
        .maybeSingle();
      if (partnerError) throw partnerError;
      if (!active) return;

      const { data: rows, error: messagesError } = await client
        .from('messages')
        .select('id, room_id, sender_id, content, image_path, created_at')
        .eq('room_id', ownMember.room_id)
        .order('created_at', { ascending: true })
        .limit(200);
      if (messagesError) throw messagesError;

      const loaded = await Promise.all(
        (rows ?? []).map(async (message) => {
          if (!message.image_path) return message as ChatMessage;
          const { data, error: imageError } = await client.storage
            .from('chat-images')
            .createSignedUrl(message.image_path, 3600);
          if (imageError) throw imageError;
          return { ...message, imageUrl: data.signedUrl } as ChatMessage;
        })
      );
      if (!active) return;
      setError(null);
      setMember(ownMember);
      setPartner(partnerMember);
      partnerRef.current = partnerMember;
      setMessages((current) => mergeMessages(current, loaded));

      channel = client
        .channel(`couple:${ownMember.room_id}`, {
          config: { private: true, presence: { key: session.user.id } },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${ownMember.room_id}`,
          },
          async (payload) => {
            const message = payload.new as ChatMessage;
            let nextMessage = message;
            if (message.image_path) {
              const { data, error: imageError } = await client.storage
                .from('chat-images')
                .createSignedUrl(message.image_path, 3600);
              if (imageError) {
                if (active) setError(imageError.message);
                return;
              }
              nextMessage = { ...message, imageUrl: data.signedUrl };
            }
            if (active) setMessages((current) => mergeMessages(current, [nextMessage]));
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'couple_members',
            filter: `room_id=eq.${ownMember.room_id}`,
          },
          (payload) => {
            const joinedMember = payload.new as CoupleMember;
            if (!active || joinedMember.user_id === session.user.id) return;
            partnerRef.current = joinedMember;
            setPartner(joinedMember);
            const presence = Object.values(channel?.presenceState() ?? {}).flat() as PresenceEntry[];
            const present = presence.some((entry) => entry.user_id === joinedMember.user_id);
            setPartnerOnline(present);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'couple_members',
            filter: `room_id=eq.${ownMember.room_id}`,
          },
          (payload) => {
            const updatedMember = payload.new as CoupleMember;
            if (!active) return;
            if (updatedMember.user_id === session.user.id) setMember(updatedMember);
            else {
              partnerRef.current = updatedMember;
              setPartner(updatedMember);
            }
          }
        )
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (!active || payload.user_id === session.user.id) return;
          setPartnerTyping(payload.typing === true);
        })
        .on('presence', { event: 'sync' }, () => {
          if (!active || !channel) return;
          const presence = Object.values(channel.presenceState()).flat() as PresenceEntry[];
          const present = presence.some((entry) => entry.user_id === partnerRef.current?.user_id);
          setPartnerOnline(Boolean(partnerRef.current && present));
          if (!present) setPartnerTyping(false);
        })
        .subscribe(async (status) => {
          if (!active || !channel) return;
          if (status === 'SUBSCRIBED') {
            const result = await channel.track({
              user_id: session.user.id,
              display_name: ownMember.display_name,
            });
            if (result !== 'ok' && active) setError('Could not publish your online status.');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setError('Live chat disconnected. Check your connection and reopen the app.');
          }
        });
      channelRef.current = channel;
    };

    loadChat()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your chat.');
      })
      .finally(() => {
        if (active && sessionKey) setLoadedSessionKey(sessionKey);
      });

    return () => {
      active = false;
      channelRef.current = null;
      if (channel) void client.removeChannel(channel);
    };
  }, [paused, session, sessionKey]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      !supabase ||
      !member ||
      !lastMessage ||
      lastMessage.sender_id === member.user_id ||
      new Date(member.last_read_at).getTime() >= new Date(lastMessage.created_at).getTime() ||
      lastReadTargetRef.current === lastMessage.id
    ) {
      return;
    }

    lastReadTargetRef.current = lastMessage.id;
    void (async () => {
      try {
        const { data: readAt, error: updateError } = await supabase.rpc('mark_room_read');
        if (updateError) throw updateError;
        if (!readAt) throw new Error('The read receipt was not updated.');
        setMember((current) => (current ? { ...current, last_read_at: readAt } : current));
      } catch (cause) {
        if (cause instanceof Error) {
          lastReadTargetRef.current = null;
          setError(cause.message);
        } else {
          lastReadTargetRef.current = null;
          setError('The read receipt was not updated.');
        }
      }
    })();
  }, [member, messages]);

  const sendTyping = useCallback(async (typing: boolean) => {
    const channel = channelRef.current;
    if (!channel || !session) return;
    try {
      const result = await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: session.user.id, typing },
      });
      if (result !== 'ok') setError('Could not update the typing indicator.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the typing indicator.');
    }
  }, [session]);

  const insertMessage = useCallback(async (content: string, imagePath: string | null) => {
    if (!supabase || !member || !session) throw new Error('Your chat is not ready yet.');
    const { data, error: insertError } = await supabase
      .from('messages')
      .insert({
        room_id: member.room_id,
        sender_id: session.user.id,
        content,
        image_path: imagePath,
      })
      .select('id, room_id, sender_id, content, image_path, created_at')
      .single();
    if (insertError) throw insertError;

    if (data.image_path) {
      const { data: signed, error: imageError } = await supabase.storage
        .from('chat-images')
        .createSignedUrl(data.image_path, 3600);
      if (imageError) throw imageError;
      const message = { ...data, imageUrl: signed.signedUrl } as ChatMessage;
      setMessages((current) => mergeMessages(current, [message]));
      return message;
    }
    const message = data as ChatMessage;
    setMessages((current) => mergeMessages(current, [message]));
    return message;
  }, [member, session]);

  const sendText = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      await insertMessage(trimmed, null);
      void sendTyping(false);
    },
    [insertMessage, sendTyping]
  );

  const sendImage = useCallback(async (uri: string, mimeType: string) => {
    if (!supabase || !member || !session) throw new Error('Your chat is not ready yet.');
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read the selected image.');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');

    const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const path = `${member.room_id}/${session.user.id}/${Crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    try {
      await insertMessage('', path);
    } catch (cause) {
      const { error: cleanupError } = await supabase.storage.from('chat-images').remove([path]);
      if (cleanupError) {
        throw new Error(`Image message failed (${String(cause)}); uploaded file cleanup failed (${cleanupError.message}).`);
      }
      throw cause;
    }
  }, [insertMessage, member, session]);

  return {
    member,
    partner,
    messages,
    partnerOnline,
    partnerTyping,
    loading: Boolean(session && !paused && sessionKey !== loadedSessionKey),
    error,
    setError,
    sendText,
    sendImage,
    sendTyping,
  };
}
