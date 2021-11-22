import type { Locale, Locales, LocaleTree, Parameters } from '../src/@types/locales';
import * as en from './en-us.json';
import * as fr from './fr-FR.json';

const locales: Locales = {
  'en-us': en,
  'fr-FR': fr,
};

export class RegionLocales {
  locale(locale?: string): Locale {
    if (!Object.keys(locales).includes(locale ?? 'en-us')) throw new RangeError('Invalid Locale');
    const fetched: Locale = locales[(locale ?? 'en-us') as keyof Locales];
    return fetched;
  }

  replace(input: string, parameters?: Parameters): string {
    let replaced: string = input;
    for (const parameter in parameters) {
      if (Object.prototype.hasOwnProperty.call(parameters, parameter)) {
        const regex: RegExp = new RegExp(`%{${parameter}}%`);
        replaced = replaced.replace(regex, String(parameters[parameter]));
      }
    }

    return replaced;
  }

  get(path: string, locale?: string): LocaleTree | string {
    const pathArray: string[] = path.split('.');
    let fetched: LocaleTree | string = (locales as Locales)[(locale ?? 'en-us') as keyof Locales];
    for (const pathCommand of pathArray) {
      if (typeof fetched === 'string') break;
      fetched = fetched?.[pathCommand as keyof LocaleTree] as LocaleTree | string;
    }

    return fetched;
  }
}