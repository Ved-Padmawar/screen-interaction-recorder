import { AppView } from '../domain/contracts'
import { PopupPage } from '../pages/PopupPage'
import { RecordingsPage } from '../pages/RecordingsPage'
import { TooltipEditorPage } from '../pages/TooltipEditorPage'
import { ViewerPage } from '../pages/ViewerPage'

function getCurrentView(): AppView {
  const filename = window.location.pathname.split('/').pop()
  const queryView = new URLSearchParams(window.location.search).get('view')

  switch (queryView || filename) {
    case 'popup.html':
    case AppView.Popup:
      return AppView.Popup
    case 'viewer.html':
    case AppView.Viewer:
      return AppView.Viewer
    case 'tooltip-editor.html':
    case AppView.TooltipEditor:
      return AppView.TooltipEditor
    case 'recordings.html':
    case AppView.Recordings:
    case '':
    case 'index.html':
      return AppView.Recordings
    default:
      return AppView.Recordings
  }
}

export function App() {
  const view = getCurrentView()

  if (view === AppView.Popup) return <PopupPage />
  if (view === AppView.Viewer) return <ViewerPage />
  if (view === AppView.TooltipEditor) return <TooltipEditorPage />

  return <RecordingsPage />
}
