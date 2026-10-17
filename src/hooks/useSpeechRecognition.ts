import { useCallback, useEffect, useRef, useState } from 'react'

// Tipuri minimale pentru Web Speech API (nu sunt incluse în lib.dom).
type SpeechRecognitionResultLike = { 0: { transcript: string }; isFinal: boolean }
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function useSpeechRecognition(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  const supported = typeof window !== 'undefined' && !!getCtor()

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => () => recRef.current?.abort(), [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    setError(null)
    const rec = new Ctor()
    rec.lang = 'ro-RO'
    rec.continuous = true
    rec.interimResults = true
    let finalText = ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      onTextRef.current((finalText + interim).trim(), !interim)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') setError('Accesul la microfon a fost refuzat.')
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setError('Recunoașterea vocală a eșuat.')
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  return { supported, listening, error, start, stop }
}
