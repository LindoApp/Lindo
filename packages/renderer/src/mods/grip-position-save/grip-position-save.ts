import { Mod } from '../mod'
import { DofusWindow, WuiDom, GUIEvents } from '@/dofus-window'
import { RootStore } from '@/store'
import { TranslationFunctions } from '@lindo/i18n'
import { EventManager } from '../helpers'
import { observe } from 'mobx'

export class GripPositionSaveMod extends Mod {
  private readonly disposer: () => void
  private readonly eventManager = new EventManager()
  private grips = ['timeline', 'party', 'notificationBar', 'challengeIndicator', 'roleplayBuffs']

  constructor(wGame: DofusWindow, rootStore: RootStore, LL: TranslationFunctions) {
    super(wGame, rootStore, LL)
    this.registerEvent()

    observe(this.rootStore.modStore.gripPosition.grips, (change) => {
      if (change.type === 'update') {
        console.log(change)
        // this.moveElement(target)
      }
    })

    const storageListener = (e: StorageEvent) => {
      console.log('storageListener')
      if (e.key?.includes('Position')) {
        const target = e.key.slice(0, -8)
        this.moveElement(target)
      }
    }

    window.addEventListener('storage', storageListener)

    this.disposer = () => {
      console.log('storage disposer')
      window.removeEventListener('storage', storageListener)
    }
  }

  public registerEvent(): void {
    this.grips.forEach((grip) => {
      this.registerGrip(grip)
    })

    const onResize = () => {
      console.log('onResize')
      // Move grips to not overlap foreground
      this.grips.forEach((grip) => {
        this.moveElement(grip)
      })
    }
    this.eventManager.on<GUIEvents, 'resize'>(this.wGame.gui, 'resize', onResize)
  }

  private moveElement(target: string) {
    if (window.localStorage.getItem(target + 'Position') && this.wGame?.gui?.isConnected) {
      const position = JSON.parse(window.localStorage.getItem(target + 'Position')!)
      const mapScene = this.wGame.document.querySelector<HTMLCanvasElement>('#mapScene-canvas')!
      let availableWidth = mapScene.clientWidth
      const availableHeight = mapScene.clientHeight
      if (mapScene.offsetLeft) {
        availableWidth = availableWidth + mapScene.offsetLeft
      }
      const cssTarget = '.' + target.charAt(0).toUpperCase() + target.slice(1)
      const targetWidth = this.wGame.document?.querySelector?.(cssTarget)?.clientWidth
      const targetHeight = this.wGame.document?.querySelector?.(cssTarget)?.clientHeight
      if (
        targetWidth !== undefined &&
        targetHeight !== undefined &&
        availableWidth !== undefined &&
        availableHeight !== undefined
      ) {
        const left =
          position.left.slice(0, -2) < availableWidth - targetWidth
            ? position.left.slice(0, -2)
            : availableWidth - targetWidth
        const top =
          position.top.slice(0, -2) < availableHeight - targetHeight
            ? position.top.slice(0, -2)
            : availableHeight - targetHeight

        // Removing existing stylesheet
        this.wGame?.document?.querySelector?.('#' + target + 'stylesheet')?.remove?.()

        const stylesheet = this.wGame.document.createElement('style')
        stylesheet.id = target + 'stylesheet'
        stylesheet.innerHTML = cssTarget
        stylesheet.innerHTML += '{'
        stylesheet.innerHTML += 'top:' + top + 'px !important;'
        stylesheet.innerHTML += 'left:' + left + 'px !important;'
        stylesheet.innerHTML += '}'
        this.wGame.document.head.appendChild(stylesheet)
      }
    }
  }

  private savePosition(element: string, top: string, left: string) {
    const obj = { top, left }
    console.log('savePosition', obj)
    window.localStorage.setItem(element + 'Position', JSON.stringify(obj))
    window.dispatchEvent(new Event('storage'))
  }

  private registerGrip(grip: string) {
    this.eventManager.on(this.wGame.gui[grip as never], 'dragEnd', () => {
      console.log('try move ' + grip)
      const element = this.wGame.gui[grip as never] as WuiDom
      this.savePosition(grip, element.rootElement.style.top, element.rootElement.style.left)
    })

    if (grip === 'timeline') {
      this.eventManager.on(this.wGame.gui[grip as never], 'resized', () => {
        this.moveElement(grip)
      })
    }

    if (JSON.parse(window.localStorage.getItem(grip + 'Position')!)) {
      this.moveElement(grip)
    }
  }

  destroy(): void {
    this.disposer()
    this.eventManager.close()
  }
}
