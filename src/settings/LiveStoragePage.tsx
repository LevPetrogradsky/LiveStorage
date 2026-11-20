import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, HardDrive, House, UserRound } from 'lucide-react'
import type { AppLanguage } from '../language'
import JournalCloudPanel, { type JournalCloudControls } from './JournalCloudPanel'
import './settings.css'

export default function LiveStoragePage({ account, journalSync, language, onSaveCopy, onBack, onHub, backLabel, showContextBack, onboardingDisabled, onOnboardingChange }: {
  account?: ReactNode
  journalSync: JournalCloudControls
  language: AppLanguage
  onSaveCopy: () => void
  onBack: () => void
  onHub: () => void
  backLabel: string
  showContextBack: boolean
  onboardingDisabled?: boolean | null
  onOnboardingChange?: (disabled: boolean) => Promise<boolean>
}) {
  const ru = language === 'ru'
  const [screen, setScreen] = useState<'home' | 'account' | 'journal'>('home')
  const [savingPreference, setSavingPreference] = useState(false)
  const [preferenceError, setPreferenceError] = useState(false)
  return <main className="settings-page live-storage-page" aria-labelledby="live-storage-title">
    <nav className="live-storage-page__navigation" aria-label={ru ? 'Навигация LifeStorage' : 'LifeStorage navigation'}>
      <button type="button" aria-current={screen === 'home' ? 'page' : undefined} onClick={() => setScreen('home')}>
        <House size={17} aria-hidden="true" />{ru ? 'Домой' : 'Home'}
      </button>
      {showContextBack && <button type="button" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" />{backLabel}
      </button>}
      <button type="button" onClick={onHub}><ArrowLeft size={17} aria-hidden="true" />{ru ? 'Вернуться в Hub' : 'Back to Hub'}</button>
    </nav>
    <div className="live-storage-page__heading">
      <span className="live-storage-page__mark" aria-hidden="true"><HardDrive size={25} /></span>
      <div>
        <h1 id="live-storage-title">LifeStorage</h1>
        <p>{ru ? 'Аккаунт и сохранение Journal — в одном месте.' : 'Your account and Journal storage in one place.'}</p>
      </div>
    </div>
    {screen === 'home' && <div className="live-storage-page__home" aria-label={ru ? 'Разделы LifeStorage' : 'LifeStorage sections'}>
      <button type="button" onClick={() => setScreen('account')}><UserRound size={21} aria-hidden="true" /><span><strong>Life Account</strong><small>{ru ? 'Вход и аккаунт' : 'Sign in and account'}</small></span><ArrowRight size={17} aria-hidden="true" /></button>
      <button type="button" onClick={() => setScreen('journal')}><BookOpen size={21} aria-hidden="true" /><span><strong>{ru ? 'Хранение Journal' : 'Journal storage'}</strong><small>{ru ? 'Сохранение и копия данных' : 'Sync and backup'}</small></span><ArrowRight size={17} aria-hidden="true" /></button>
    </div>}
    {screen === 'account' && <div className="live-storage-page__sections">
      <section className="live-storage-page__card" aria-labelledby="live-account-title">
        <h2 id="live-account-title"><UserRound size={19} aria-hidden="true" />Life Account</h2>
        {account ?? <p className="settings-page__description">{ru ? 'Вход в аккаунт пока недоступен. Ваши данные на этом устройстве не меняются.' : 'Account sign-in is currently unavailable. Data on this device is unchanged.'}</p>}
        {onOnboardingChange && typeof onboardingDisabled === 'boolean' && <div className="live-storage-page__preference">
          <label><span><strong>{ru ? 'Отключить вводные экраны' : 'Skip intro screens'}</strong><small>{ru ? 'Для этого аккаунта во всех подключённых сервисах.' : 'For this account across connected services.'}</small></span>
            <input type="checkbox" role="switch" checked={onboardingDisabled} disabled={savingPreference} onChange={event => {
              setSavingPreference(true)
              setPreferenceError(false)
              void onOnboardingChange(event.currentTarget.checked).then(saved => setPreferenceError(!saved)).catch(() => setPreferenceError(true)).finally(() => setSavingPreference(false))
            }} />
          </label>
          {preferenceError && <p role="alert">{ru ? 'Не удалось сохранить настройку. Повторите позже.' : 'Could not save the setting. Try again later.'}</p>}
        </div>}
      </section>
    </div>}
    {screen === 'journal' && <div className="live-storage-page__sections">
      <section className="live-storage-page__card" aria-label={ru ? 'Хранение Journal' : 'Journal storage'}>
        <JournalCloudPanel cloud={journalSync} language={language} onSaveCopy={onSaveCopy} />
      </section>
    </div>}
  </main>
}
