'use client';

import { useState, type ComponentPropsWithoutRef } from 'react';
import { gamePlayerProfile } from '@/lib/gamePlayerProfile';

const DEFAULT_AVATAR = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#354052"/><circle cx="32" cy="23" r="10" fill="#e1e6ee"/><path d="M12 58a20 20 0 0 1 40 0" fill="#e1e6ee"/></svg>',
)}`;

type Props = Omit<ComponentPropsWithoutRef<'img'>, 'src' | 'onError'> & {
  src?: string | null;
  playerId?: string | null;
};

export function GamePlayerAvatar({ src, playerId, alt = '', ...props }: Props) {
  const { avatar } = gamePlayerProfile(null, src, playerId);
  const [failedAvatar, setFailedAvatar] = useState<string>();

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      src={failedAvatar === avatar ? DEFAULT_AVATAR : avatar}
      referrerPolicy="no-referrer"
      onError={() => setFailedAvatar(avatar)}
    />
  );
}
