import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, BookOpen, ClipboardList, HardDrive, X } from 'lucide-react'
import { maxDisplayNameLength } from '../data'
import type { AppLanguage } from '../language'
import type { AccountEntryMode } from '../settings/AccountPanel'
import { requestOnboardingFeedback, type OnboardingMode } from './state'
import './onboarding.css'

export default function OnePageOnboarding({ mode, displayName, account, language, accountPreferenceAvailable, onComplete, onClose }: {
  mode: Exclude<OnboardingMode, null>
  displayName: string
  account?: (mode: AccountEntryMode) => ReactNode
  language: AppLanguage
  accountPreferenceAvailable: boolean
  onComplete: (name: string, disableAll: boolean) => Promise<boolean>
  onClose: () => void
}) {
  const ru = language === 'ru'
  const [name, setName] = useState(displayName)
  const [disableAll, setDisableAll] = useState(false)
  const [accountMode, setAccountMode] = useState<AccountEntryMode>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [viewport, setViewport] = useState(() => ({ height: window.visualViewport?.height, top: window.visualViewport?.offsetTop ?? 0 }))

  useEffect(() => {
    const visualViewport = window.visualViewport
    if (!visualViewport) return
    const update = () => setViewport({ height: visualViewport.height, top: visualViewport.offsetTop })
    visualViewport.addEventListener('resize', update)
    visualViewport.addEventListener('scroll', update)
    return () => { visualViewport.removeEventListener('resize', update); visualViewport.removeEventListener('scroll', update) }
  }, [])

  const finish = async (chosenName: string) => {
    if (busy) return
    requestOnboardingFeedback()
    setBusy(true)
    setError(false)
    try { if (!await onComplete(chosenName.trim(), disableAll)) setError(true) }
    catch { setError(true) }
    finally { setBusy(false) }
  }

  return <div className="lifeos-onboarding" role="dialog" aria-modal="true" aria-label={ru ? 'Добро пожаловать в LifePortable' : 'Welcome to LifePortable'}
    style={{ height: viewport.height ? `${viewport.height}px` : '100dvh', top: viewport.top }}>
    <div className="lifeos-onboarding__header">
      {accountMode ? <button type="button" className="lifeos-onboarding__back" onClick={() => setAccountMode(undefined)}><ArrowLeft size={17} aria-hidden="true" />{ru ? 'Назад' : 'Back'}</button> : <span />}
      {mode === 'preview' && <button type="button" className="lifeos-onboarding__close" aria-label={ru ? 'Закрыть просмотр' : 'Close onboarding preview'} onClick={onClose}><X size={20} aria-hidden="true" /></button>}
    </div>
    <main className="lifeos-onboarding__content lifeos-onboarding__one-page">
      <p className="lifeos-onboarding__eyebrow">LifePortable</p>
      <h1>{accountMode ? (ru ? 'Аккаунт' : 'Account') : (ru ? 'Добро пожаловать в LifePortable' : 'Welcome to LifePortable')}</h1>
      {accountMode ? <div className="lifeos-onboarding__account">{account?.(accountMode)}</div> : <>
        <p className="lifeos-onboarding__description">{ru ? 'Все сервисы — в одном месте. Начните с любого раздела.' : 'Your services in one place. Start wherever you like.'}</p>
        <div className="lifeos-onboarding__items">
          <div className="lifeos-onboarding__feature"><span className="lifeos-onboarding__icon"><ClipboardList size={22} aria-hidden="true" /></span><span><strong>LifeTasks</strong><small>{ru ? 'Планы и дела' : 'Plans and tasks'}</small></span></div>
          <div className="lifeos-onboarding__feature"><span className="lifeos-onboarding__icon"><BookOpen size={22} aria-hidden="true" /></span><span><strong>LifeJournal</strong><small>{ru ? 'Записи и мысли' : 'Notes and thoughts'}</small></span></div>
          <div className="lifeos-onboarding__feature"><span className="lifeos-onboarding__icon"><HardDrive size={22} aria-hidden="true" /></span><span><strong>LifeStorage</strong><small>{ru ? 'Аккаунт и хранение Journal' : 'Account and Journal storage'}</small></span></div>
        </div>
        {account && <div className="lifeos-onboarding__account-options">
          <button type="button" onClick={() => setAccountMode('sign-up')}>{ru ? 'Создать аккаунт' : 'Create account'}</button>
          <button type="button" onClick={() => setAccountMode('sign-in')}>{ru ? 'Войти' : 'Sign in'}</button>
        </div>}
        <label className="lifeos-onboarding__name"><strong>{ru ? 'Как к вам обращаться? Необязательно.' : 'What should we call you? Optional.'}</strong>
          <input type="text" autoComplete="nickname" maxLength={maxDisplayNameLength} value={name} onChange={event => setName(event.currentTarget.value)} placeholder={ru ? 'Имя' : 'Name'} />
        </label>
        {accountPreferenceAvailable && <label className="lifeos-onboarding__global-choice">
          <input type="checkbox" checked={disableAll} onChange={event => setDisableAll(event.currentTarget.checked)} />
          <span>{ru ? 'Не показывать вводные экраны в подключённых сервисах этого аккаунта' : 'Skip intro screens in connected services for this account'}</span>
        </label>}
      </>}
    </main>
    {!accountMode && <div className="lifeos-onboarding__footer">
      {error && <p role="alert" className="lifeos-onboarding__error">{ru ? 'Не удалось сохранить выбор. Попробуйте ещё раз.' : 'Could not save your choice. Please try again.'}</p>}
      <button type="button" className="lifeos-onboarding__primary" disabled={busy} onClick={() => void finish(name)}>{ru ? 'Открыть LifePortable' : 'Open LifePortable'}</button>
      {!accountPreferenceAvailable && <button type="button" className="lifeos-onboarding__skip" disabled={busy} onClick={() => void finish('')}>{ru ? 'Пропустить знакомство здесь' : 'Skip intro on this site'}</button>}
    </div>}
  </div>
}
