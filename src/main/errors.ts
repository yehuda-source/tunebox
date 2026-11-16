/** Turn yt-dlp / network errors into something a person can act on. */
export function friendlyError(msg: string): string {
  if (/Video unavailable|Private video|has been removed|This video is not available/i.test(msg))
    return 'This video is unavailable.'
  if (/Sign in to confirm your age|age.restricted|inappropriate for some users/i.test(msg))
    return 'This song is age-restricted. Turn on Settings → YouTube sign-in to download it.'
  if (/not a bot|Sign in to confirm|Please sign in|members-only|Join this channel/i.test(msg))
    return 'YouTube only allows this upload when signed in, and no other upload of the song was found. Turn on Settings → YouTube sign-in, then retry.'
  if (/HTTP Error 429|Too Many Requests/i.test(msg))
    return 'YouTube is rate-limiting requests. Wait a few minutes and retry.'
  if (
    /getaddrinfo|ENOTFOUND|EAI_AGAIN|network is unreachable|timed out|Connection (refused|reset)/i.test(
      msg
    )
  )
    return 'Can’t reach YouTube. Check your internet connection.'
  if (/No space left|ENOSPC/i.test(msg)) return 'The disk is full.'
  if (/EACCES|EPERM|Permission denied/i.test(msg))
    return 'TuneBox can’t write to the download folder. Choose another folder in Settings.'
  return msg.replace(/^ERROR:\s*/, '').slice(0, 300)
}
