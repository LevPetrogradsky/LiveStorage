import { useState } from 'react'
import { Cloud, Copy, Download, RotateCw } from 'lucide-react'
import { formatRecoveryCode, generateRecoveryCode, normalizeRecoveryCode } from '../journal/guest-recovery'
import type { AppLanguage } from '../language'

export type JournalCloudControls = {
  available: boolean
  enabled: boolean
  guest: boolean
  code: string | null
  status: string
  error: boolean
  lastSavedAt: string | null
  onRetry: () => void
  onEnable: (code: string | null) => Promise<boolean>
  onVerifyRecovery: (code: string) => Promise<boolean>
  onRecover: (code: string) => Promise<boolean>
}

export default function JournalCloudPanel({ cloud, language, onSaveCopy }: {
  cloud: JournalCloudControls
  language: AppLanguage
  onSaveCopy: () => void
}) {
  const ru = language === 'ru'
  const [mode, setMode] = useState<'enable' | 'recover' | null>(null)
  const [newCode, setNewCode] = useState('')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null)
  const [codeSaved, setCodeSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const startEnable = () => {
    setNewCode(cloud.guest ? generateRecoveryCode() : '')
    setCodeSaved(false)
    setMessage('')
    setMode('enable')
  }
  const startRecover = () => { setMessage(''); setVerifiedCode(null); setMode('recover') }
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(formatRecoveryCode(code))
      setMessage(ru ? 'Код скопирован. Сохраните его в приватном месте.' : 'Code copied. Keep it somewhere private.')
    } catch {
      setMessage(ru ? 'Выделите и скопируйте код вручную.' : 'Select and copy the code manually.')
    }
  }
  const enable = async () => {
    setBusy(true); setMessage('')
    try {
      if (await cloud.onEnable(cloud.guest ? newCode : null)) setMode(null)
      else setMessage(ru ? 'Не удалось включить облако. Записи остались на устройстве.' : 'Cloud storage could not be enabled. Your notes stayed on this device.')
    } finally { setBusy(false) }
  }
  const verify = async () => {
    const code = normalizeRecoveryCode(recoveryInput)
    if (!code) { setMessage(ru ? 'Проверьте код: нужно 64 символа.' : 'Check the code: it should contain 64 characters.'); return }
    setBusy(true); setMessage('')
    try {
      if (await cloud.onVerifyRecovery(code)) setVerifiedCode(code)
      else setMessage(ru ? 'Такой код не найден. Записи на этом устройстве не изменены.' : 'Code not found. Notes on this device were not changed.')
    } finally { setBusy(false) }
  }
  const recover = async () => {
    if (!verifiedCode) return
    setBusy(true); setMessage('')
    try {
      if (await cloud.onRecover(verifiedCode)) setMode(null)
      else setMessage(ru ? 'Не удалось подключить облако. Записи на этом устройстве не изменены.' : 'Could not connect cloud storage. Notes on this device were not changed.')
    } finally { setBusy(false) }
  }

  return <div className="settings-page__journal-sync" role="region" aria-label={ru ? 'Сохранение Journal' : 'Journal storage'}>
    <strong><Cloud size={16} aria-hidden="true" />{ru ? 'Сохранение Journal' : 'Journal storage'}</strong>
    {cloud.enabled ? <>
      <span>{cloud.error
        ? (ru ? 'Ошибка синхронизации. Записи остались на этом устройстве.' : 'Sync error. Your notes are still on this device.')
        : cloud.lastSavedAt && cloud.status !== 'Syncing Journal…'
          ? (ru ? 'Синхронизировано с облаком' : 'Synced with cloud storage')
          : (ru ? 'Проверяем синхронизацию…' : 'Checking sync…')}</span>
      {cloud.lastSavedAt && <small>{ru ? 'Последнее сохранение:' : 'Last saved:'} {new Date(cloud.lastSavedAt).toLocaleString(ru ? 'ru-RU' : 'en-US')}</small>}
      {cloud.guest && cloud.code && <div className="settings-page__recovery-code">
        <span>{ru ? 'Код восстановления — храните приватно. Любой, у кого есть код, сможет открыть ваши записи.' : 'Recovery code — keep it private. Anyone with this code can open your notes.'}</span>
        <input readOnly aria-label={ru ? 'Код восстановления' : 'Recovery code'} value={formatRecoveryCode(cloud.code)} onFocus={event => event.currentTarget.select()} />
        <button type="button" className="settings-page__action" onClick={() => void copyCode(cloud.code!)}><Copy size={15} />{ru ? 'Скопировать код' : 'Copy code'}</button>
      </div>}
      {cloud.error && <button type="button" className="settings-page__action" onClick={cloud.onRetry}><RotateCw size={15} />{ru ? 'Повторить' : 'Retry'}</button>}
    </> : <>
      <span>{cloud.available
        ? (ru ? 'Сейчас записи только на этом устройстве. Облако включается по вашему выбору.' : 'Notes are on this device only. You choose whether to turn on cloud storage.')
        : (ru ? 'Только на этом устройстве. Синхронизация Journal пока недоступна.' : 'Saved on this device only. Journal sync is not available yet.')}</span>
      {cloud.available && <div className="settings-page__cloud-actions">
        <button type="button" className="settings-page__action" onClick={startEnable}>{ru ? 'Включить облако' : 'Turn on cloud storage'}</button>
        {cloud.guest && <button type="button" className="settings-page__action" onClick={startRecover}>{ru ? 'У меня есть код' : 'I have a recovery code'}</button>}
      </div>}
      {!cloud.available && <button type="button" className="settings-page__action" onClick={onSaveCopy}><Download size={15} />{ru ? 'Сохранить копию' : 'Save a copy'}</button>}
    </>}
    {mode === 'enable' && !cloud.enabled && <div className="settings-page__cloud-confirm">
      <p>{cloud.guest
        ? (ru ? 'После включения ваши записи и папки Journal загрузятся в облако. На другом устройстве они откроются по этому секретному коду, без аккаунта.' : 'Turning this on uploads your Journal notes and folders to cloud storage. Use this secret code to restore them on another device, without an account.')
        : (ru ? 'После включения ваши записи и папки Journal загрузятся в аккаунт и будут доступны на других устройствах после входа.' : 'Turning this on uploads your Journal notes and folders to your account, so they are available after sign-in on another device.')}</p>
      {cloud.guest && <>
        <input readOnly aria-label={ru ? 'Новый код восстановления' : 'New recovery code'} value={formatRecoveryCode(newCode)} onFocus={event => event.currentTarget.select()} />
        <button type="button" className="settings-page__action" onClick={() => void copyCode(newCode)}><Copy size={15} />{ru ? 'Скопировать код' : 'Copy code'}</button>
        <label className="settings-page__cloud-check"><input type="checkbox" checked={codeSaved} onChange={event => setCodeSaved(event.currentTarget.checked)} />{ru ? 'Я сохранил код в приватном месте' : 'I saved the code somewhere private'}</label>
      </>}
      <div className="settings-page__cloud-actions">
        <button type="button" className="settings-page__action" disabled={busy || (cloud.guest && !codeSaved)} onClick={() => void enable()}>{ru ? 'Включить и загрузить записи' : 'Turn on and upload notes'}</button>
        <button type="button" className="settings-page__action" disabled={busy} onClick={() => setMode(null)}>{ru ? 'Отмена' : 'Cancel'}</button>
      </div>
    </div>}
    {mode === 'recover' && cloud.guest && !cloud.enabled && <div className="settings-page__cloud-confirm">
      <p>{ru ? 'Введите секретный код с другого устройства. Местные записи останутся и будут объединены с облачными после вашего подтверждения.' : 'Enter the secret code from your other device. Notes here will be kept and merged with cloud notes after you confirm.'}</p>
      <input aria-label={ru ? 'Введите код восстановления' : 'Enter recovery code'} autoComplete="off" spellCheck={false} value={recoveryInput}
        onChange={event => { setRecoveryInput(event.currentTarget.value); setVerifiedCode(null) }} />
      <div className="settings-page__cloud-actions">
        {!verifiedCode ? <button type="button" className="settings-page__action" disabled={busy} onClick={() => void verify()}>{ru ? 'Проверить код' : 'Check code'}</button>
          : <button type="button" className="settings-page__action" disabled={busy} onClick={() => void recover()}>{ru ? 'Подключить и объединить' : 'Connect and merge'}</button>}
        <button type="button" className="settings-page__action" disabled={busy} onClick={() => setMode(null)}>{ru ? 'Отмена' : 'Cancel'}</button>
      </div>
    </div>}
    {message && <small role="status">{message}</small>}
  </div>
}
