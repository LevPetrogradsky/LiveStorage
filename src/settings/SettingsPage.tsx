import { useState, type ChangeEvent, type ReactNode } from 'react'
import { ChevronRight, Compass, Copy, Download, ExternalLink, HardDrive, Monitor, Moon, Palette, Sun, Upload, UserRound } from 'lucide-react'
import { maxDisplayNameLength, visibleShortcuts, type Shortcut, type ShortcutLocation, type Theme } from '../data'
import { translate, type AppLanguage } from '../language'
import JournalCloudPanel, { type JournalCloudControls } from './JournalCloudPanel'
import './settings.css'

const shortcutNames = { tasks: 'LifeTasks', journal: 'LifeJournal', focus: 'LifeTime', flow: '3 questions' }
const themes = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const
const hubUrl = 'https://lifeos-demo-kappa.vercel.app/'

interface SettingsPageProps {
  hubOnly?: boolean
  account?: ReactNode
  onOpenStorage?: () => void
  journalSync: JournalCloudControls
  theme: Theme
  language: 'en' | 'ru'
  onLanguageChange: (language: 'en' | 'ru') => void
  onThemeChange: (theme: Theme) => void
  showHome: boolean
  onHomeVisibilityChange: (visible: boolean) => void
  showAskLiveOS: boolean
  onAskLiveOSVisibilityChange: (visible: boolean) => void
  shortcutVisible: (id: Shortcut, location: ShortcutLocation) => boolean
  onShortcutChange: (id: Shortcut, location: ShortcutLocation, visible: boolean) => void
  onExport: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  displayName: string
  onDisplayNameChange: (name: string) => boolean
}

function SettingsGroup({ title, icon, summary, children }: {
  title: string
  icon: ReactNode
  summary?: string
  children: ReactNode
}) {
  return <details className="settings-page__group">
    <summary className="settings-page__row">
      <span className="settings-page__icon" aria-hidden="true">{icon}</span>
      <span className="settings-page__label">{title}</span>
      {summary && <span className="settings-page__value">{summary}</span>}
      <ChevronRight className="settings-page__chevron" size={18} aria-hidden="true" />
    </summary>
    <div className="settings-page__panel">{children}</div>
  </details>
}

function DisplayNameForm({ name, onSave, language }: { name: string; onSave: (name: string) => boolean; language: AppLanguage }) {
  const [draft, setDraft] = useState(name)
  const t = (text: string) => translate(language, text)
  return <form className="settings-page__name-form" onSubmit={event => {
    event.preventDefault()
    const value = draft.trim()
    if (onSave(value)) setDraft(value)
  }}>
    <label className="settings-page__field">
      <strong>{t('Display name')}</strong>
      <input type="text" value={draft} maxLength={maxDisplayNameLength} autoComplete="nickname"
        placeholder={t('Optional')} onChange={event => setDraft(event.currentTarget.value)} />
    </label>
    <button type="submit" className="settings-page__action" disabled={draft.trim() === name}>{t('Save name')}</button>
  </form>
}

export default function SettingsPage({
  hubOnly = false, account, onOpenStorage, journalSync, theme, onThemeChange, language, onLanguageChange,
  showHome, onHomeVisibilityChange, showAskLiveOS, onAskLiveOSVisibilityChange,
  shortcutVisible, onShortcutChange, onExport, onImport, displayName, onDisplayNameChange,
}: SettingsPageProps) {
  const t = (text: string) => translate(language, text)
  const [copyStatus, setCopyStatus] = useState('')
  const copyHubLink = async () => {
    try {
      await navigator.clipboard.writeText(hubUrl)
      setCopyStatus(language === 'ru' ? 'Ссылка скопирована.' : 'Link copied.')
    } catch {
      setCopyStatus(language === 'ru' ? 'Выделите и скопируйте адрес.' : 'Select and copy the address.')
    }
  }
  return <main className="settings-page settings-page--hub" aria-labelledby="settings-page-title">
    <h1 id="settings-page-title">{t('Settings')}</h1>
    <div className="settings-page__hub-link">
      <strong>{language === 'ru' ? 'Ссылка на LifePortable' : 'LifePortable link'}</strong>
      <div className="settings-page__hub-link-controls">
        <a className="settings-page__hub-link-url" href={hubUrl} target="_blank" rel="noopener noreferrer">
          {hubUrl}<ExternalLink size={15} aria-hidden="true" />
        </a>
        <button type="button" onClick={() => void copyHubLink()} aria-label={language === 'ru' ? 'Скопировать ссылку на LifePortable' : 'Copy LifePortable link'}>
          <Copy size={17} aria-hidden="true" />{language === 'ru' ? 'Копировать' : 'Copy'}
        </button>
      </div>
      {copyStatus && <span role="status" className="settings-page__hub-link-status">{copyStatus}</span>}
    </div>
    <div className="settings-page__groups">
      <SettingsGroup title={onOpenStorage ? 'LifeStorage' : 'Life Account'} icon={<UserRound size={18} />}>
        {onOpenStorage ? <>
          <p className="settings-page__description">{language === 'ru' ? 'Аккаунт и сохранение данных находятся в LifeStorage.' : 'Your account and saved data are in LifeStorage.'}</p>
          <button type="button" className="settings-page__action" onClick={onOpenStorage}>{language === 'ru' ? 'Открыть LifeStorage' : 'Open LifeStorage'}</button>
        </> : <>
          {account}
          <JournalCloudPanel cloud={journalSync} language={language} onSaveCopy={onExport} />
        </>}
      </SettingsGroup>

      <SettingsGroup title={t('Profile & appearance')} icon={<Palette size={18} />}
        summary={t(themes.find(option => option.value === theme)?.label ?? '')}>
        <fieldset className="settings-page__themes">
          <legend>{t('Theme')}</legend>
          <div className="settings-page__theme-options">
            {themes.map(({ value, label, Icon }) => <label className="settings-page__theme" key={value}>
              <input type="radio" name="lifeos-theme" checked={theme === value} onChange={() => onThemeChange(value)} />
              <span><Icon size={17} aria-hidden="true" />{t(label)}</span>
            </label>)}
          </div>
        </fieldset>
        <fieldset className="settings-page__themes">
          <legend>{t('Language / Язык')}</legend>
          <div className="settings-page__theme-options">
            {(['en', 'ru'] as const).map(value => <label className="settings-page__theme" key={value}>
              <input type="radio" name="lifeos-language" checked={language === value} onChange={() => onLanguageChange(value)} />
              <span>{value === 'en' ? 'English' : 'Русский'}</span>
            </label>)}
          </div>
        </fieldset>
        <DisplayNameForm key={displayName} name={displayName} onSave={onDisplayNameChange} language={language} />
      </SettingsGroup>

      {!hubOnly && <SettingsGroup title={t('Hub & navigation')} icon={<Compass size={18} />}>
        <label className="settings-page__toggle settings-page__navigation-toggle">
          <span className="settings-page__toggle-copy"><strong>{t('Hub in bottom bar')}</strong></span>
          <input type="checkbox" role="switch" aria-label={t('Hub in navigation bar')} checked={showHome}
            onChange={event => onHomeVisibilityChange(event.currentTarget.checked)} />
        </label>
        <label className="settings-page__toggle settings-page__navigation-toggle">
          <span className="settings-page__toggle-copy"><strong>{t('Guide in bottom bar')}</strong></span>
          <input type="checkbox" role="switch" aria-label={t('Guide in navigation bar')} checked={showAskLiveOS}
            onChange={event => onAskLiveOSVisibilityChange(event.currentTarget.checked)} />
        </label>
        {!showHome && <p className="settings-page__description">{t('Hub shortcuts appear when Hub is visible.')}</p>}
        <div className="settings-page__shortcut-list">
          {visibleShortcuts.map(({ id }) => <fieldset key={id} className="settings-page__shortcut">
            <legend>{shortcutNames[id]}</legend>
            {([['home', 'On Hub'], ['bar', 'In navigation bar']] as const).map(([location, label]) => <label
              className="settings-page__toggle settings-page__shortcut-option" key={location}>
              <span>{t(label)}</span>
              <input type="checkbox" role="switch" aria-label={`${shortcutNames[id]} ${t(label).toLowerCase()}`}
                checked={shortcutVisible(id, location)}
                onChange={event => onShortcutChange(id, location, event.currentTarget.checked)} />
            </label>)}
          </fieldset>)}
        </div>
      </SettingsGroup>}

      {!hubOnly && <SettingsGroup title={t('Backups')} icon={<HardDrive size={18} />}>
        <div className="settings-page__actions">
          <button type="button" className="settings-page__action" onClick={onExport}>
            <Download size={17} aria-hidden="true" />{t('Save a copy')}
          </button>
          <label className="settings-page__action settings-page__upload">
            <Upload size={17} aria-hidden="true" />{t('Restore from a copy')}
            <input type="file" accept="application/json,.json" onChange={onImport} />
          </label>
        </div>
      </SettingsGroup>}
    </div>
  </main>
}
