import {Module} from "./module";
import {EVENT, RESOURCE_LOADING_TYPE} from "./enums";
import {IPageLibAsset, IPageLibConfiguration} from "./types";
import {on} from "./decorators";
import {AssetHelper} from "./assetHelper";

export class Core extends Module {
  static get _pageConfiguration() {
    return this.__pageConfiguration;
  }

  static set _pageConfiguration(value) {
    this.__pageConfiguration = value;
  }

  private static __pageConfiguration: IPageLibConfiguration;

  @on(EVENT.ON_CONFIG)
  static config(pageConfiguration: string) {
    Core.__pageConfiguration = JSON.parse(pageConfiguration) as IPageLibConfiguration;
  }

  /**
   * Renders fragment
   * @param {string} fragmentName
   * @param {string} containerSelector
   * @param {string} replacementContentSelector
   */
  @on(EVENT.ON_FRAGMENT_RENDERED)
  static load(fragmentName: string, containerSelector?: string, replacementContentSelector?: string) {
    if (containerSelector && replacementContentSelector) {
      Core.__replace(containerSelector, replacementContentSelector);
    }
  }

  @on(EVENT.ON_FRAGMENT_RENDERED)
  static loadAssetsOnFragment(fragmentName: string) {
    const onFragmentRenderAssets = Core.__pageConfiguration.assets.filter(asset => asset.fragment === fragmentName && asset.loadMethod === RESOURCE_LOADING_TYPE.ON_FRAGMENT_RENDER && !asset.preLoaded);

    const scripts = Core.createLoadQueue(onFragmentRenderAssets);

    AssetHelper.loadJsSeries(scripts);
  }

  @on(EVENT.ON_PAGE_LOAD)
  static pageLoaded() {
    const onFragmentRenderAssets = Core.__pageConfiguration.assets.filter(asset => asset.loadMethod === RESOURCE_LOADING_TYPE.ON_PAGE_RENDER && !asset.preLoaded);

    const scripts = Core.createLoadQueue(onFragmentRenderAssets);

    AssetHelper.loadJsSeries(scripts);
  }

  @on(EVENT.ON_PAGE_LOAD)
  static asyncComponentRender() {
    const asyncFragments = Core.__pageConfiguration.fragments.filter(i => i.clientAsync);

    asyncFragments.forEach(fragment => {

      const attributes = Object.assign(location.search.slice(1).split('&').reduce((dict: { [name: string]: string }, i) => {
        const [key, value] = i.split('=');
        if (typeof value !== "undefined") {
          dict[key] = value;
        }
        return dict;
      }, {}), fragment.attributes);

      const queryString = Object.keys(attributes).reduce((query: string, key: string) => `${query}&${key}=${attributes[key]}`, '?__renderMode=stream');

      fetch(`${fragment.source}${location.pathname}${queryString}`).then(res => {
        return res.json()
      })
        .then(res => {
          Object.keys(res).forEach(key => {
            if (!key.startsWith('$')) {
              const container = document.querySelector(key === 'main' ? `[puzzle-fragment="${fragment.name}"]` : `[puzzle-fragment="${fragment.name}"][fragment-partial="${key}"]`);
              if (container) {
                this.setInnerHTML(container, res[key]);
              }
            }
          });
          this.loadAssetsOnFragment(fragment.name);
        })
    });
  }

  private static setInnerHTML(elm: any, html: any) {
    elm.innerHTML = html;
    Array.from(elm.querySelectorAll("script")).forEach((oldScript: any) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes)
        .forEach((attr: any) => newScript.setAttribute(attr.name, attr.value));
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  @on(EVENT.ON_VARIABLES)
  static onVariables(fragmentName: string, configKey: string, configData: object) {
    (window as any)[configKey] = configData;
  }

  static createLoadQueue(assets: IPageLibAsset[]) {
    const loadList: any = [];

    assets.forEach(asset => {
      if (!asset.preLoaded) {
        asset.preLoaded = true;
        asset.defer = true;

        asset.dependent && asset.dependent.forEach((dependencyName) => {
          const dependency = Core.__pageConfiguration.dependencies.filter(dependency => dependency.name === dependencyName);
          const dependencyContent = dependency[0];
          if (dependencyContent && !dependencyContent.preLoaded) {
            if (loadList.indexOf(dependencyContent) === -1) {
              loadList.push(dependencyContent);
              dependencyContent.preLoaded = true;
            }
          }
        });

        if (loadList.indexOf(asset) === -1) {
          loadList.push(asset);
        }
      }
    });

    return loadList;
  }

  /**
   * Replaces container inner with given content.
   * @param {string} containerSelector
   * @param {string} replacementContentSelector
   */
  private static __replace(containerSelector: string, replacementContentSelector: string) {
    const z = window.document.querySelector(replacementContentSelector) as any;
    const r = z.innerHTML;
    z.parentNode.removeChild(z);
    window.document.querySelector(containerSelector)!.innerHTML = r;
  }
}
