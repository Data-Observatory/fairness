import { describe, expect, it } from 'vitest';
import { loadContent } from './content';
import { lintContent, lintMessages, lintText, type StyleRules } from './style-lint';
import { EM_DASH, EN_DASH, loadFixtureFiles, mutate } from './__fixtures__/helpers';

// All special characters are written as escapes or built at runtime, so this file
// itself contains no em dash, en dash or emoji.
const GRINNING = '\u{1F600}';
const ROCKET = '\u{1F680}';
const HEART = String.fromCodePoint(0x2764);

const rules: StyleRules = {
	forbiddenTerms: {
		en: ['best', 'better', 'worst', 'superior', 'excellent', 'recommended', 'leading', 'ideal'],
		es: ['mejor', 'peor', 'superior', 'excelente', 'recomendado', 'líder', 'ideal']
	},
	forbiddenCharacters: ['em_dash', 'en_dash'],
	voseoWords: ['vos', 'tenés', 'podés', 'querés', 'sabés', 'sos', 'hacé', 'mirá', 'abrí', 'elegí'],
	informalWords: ['tú', 'tienes', 'puedes', 'puedas', 'quieres', 'necesitas']
};

const only = (rule: string, ...matches: string[]) => matches.map((match) => ({ rule, match }));

describe('lintText: forbidden characters', () => {
	it('flags an em dash', () => {
		expect(lintText(`Alpha ${EM_DASH} beta`, 'en', rules)).toEqual(
			only('forbidden-character', EM_DASH)
		);
	});

	it('flags an en dash', () => {
		expect(lintText(`2020${EN_DASH}2024`, 'en', rules)).toEqual(
			only('forbidden-character', EN_DASH)
		);
	});

	it('flags each occurrence, in order of appearance', () => {
		expect(lintText(`a${EN_DASH}b${EM_DASH}c${EM_DASH}d`, 'en', rules)).toEqual(
			only('forbidden-character', EN_DASH, EM_DASH, EM_DASH)
		);
	});

	it('flags them in Spanish as well', () => {
		expect(lintText(`Uno ${EM_DASH} dos`, 'es', rules)).toEqual(
			only('forbidden-character', EM_DASH)
		);
	});

	it('passes hyphens, commas, colons and parentheses', () => {
		expect(lintText('Alpha-beta, gamma: delta (epsilon) 2020-2024', 'en', rules)).toEqual([]);
	});

	it('only flags characters listed in forbiddenCharacters', () => {
		const emOnly: StyleRules = { ...rules, forbiddenCharacters: ['em_dash'] };
		expect(lintText(`a${EN_DASH}b`, 'en', emOnly)).toEqual([]);
		expect(lintText(`a${EM_DASH}b`, 'en', emOnly)).toEqual(only('forbidden-character', EM_DASH));
		const none: StyleRules = { ...rules, forbiddenCharacters: [] };
		expect(lintText(`a${EM_DASH}b${EN_DASH}c`, 'en', none)).toEqual([]);
	});
});

describe('lintText: emoji', () => {
	it('flags a face emoji', () => {
		expect(lintText(`Nice ${GRINNING}`, 'en', rules)).toEqual(only('emoji', GRINNING));
	});

	it('flags a rocket and a heart (Extended_Pictographic)', () => {
		expect(lintText(`Go ${ROCKET}`, 'en', rules)).toEqual(only('emoji', ROCKET));
		expect(lintText(`Love ${HEART}`, 'en', rules)).toEqual(only('emoji', HEART));
	});

	it('flags each emoji separately', () => {
		expect(lintText(`${GRINNING}${ROCKET}`, 'en', rules)).toEqual(only('emoji', GRINNING, ROCKET));
	});

	it('flags emoji in Spanish text', () => {
		expect(lintText(`Hola ${GRINNING}`, 'es', rules)).toEqual(only('emoji', GRINNING));
	});

	it('passes accented letters, digits, hash and plain punctuation', () => {
		expect(lintText('Café, año 2026 #1 100% (ok)? Sí!', 'es', rules)).toEqual([]);
	});
});

describe('lintText: emoticons', () => {
	it.each([':)', ':-)', ';)', ':D', ':('])('flags %s', (emoticon) => {
		expect(lintText(`Thanks ${emoticon}`, 'en', rules)).toEqual(only('emoticon', emoticon));
	});

	it('flags an emoticon in Spanish text', () => {
		expect(lintText('Gracias :)', 'es', rules)).toEqual(only('emoticon', ':)'));
	});

	it('passes colons and parentheses used as ordinary punctuation', () => {
		expect(
			lintText('Note: (optional) at 10:30, ratio 3:1, see https://example.org/a', 'en', rules)
		).toEqual([]);
	});
});

describe('lintText: forbidden terms', () => {
	it('flags an English term', () => {
		expect(lintText('The best option', 'en', rules)).toEqual(only('forbidden-term', 'best'));
	});

	it('flags a Spanish term', () => {
		expect(lintText('La mejor opción', 'es', rules)).toEqual(only('forbidden-term', 'mejor'));
	});

	it('is case-insensitive and reports the text as written', () => {
		expect(lintText('BEST and Better', 'en', rules)).toEqual(
			only('forbidden-term', 'BEST', 'Better')
		);
	});

	it('flags every occurrence', () => {
		expect(lintText('best, then best again', 'en', rules)).toEqual(
			only('forbidden-term', 'best', 'best')
		);
	});

	it('matches whole words only', () => {
		expect(lintText('Bestow the stopwatch and topology', 'en', rules)).toEqual([]);
		expect(lintText('Mejorar y mejoras', 'es', rules)).toEqual([]);
	});

	it('matches next to punctuation', () => {
		expect(lintText('(best), "ideal"; leading.', 'en', rules)).toEqual(
			only('forbidden-term', 'best', 'ideal', 'leading')
		);
	});

	it('handles accented terms with Unicode-aware word boundaries', () => {
		expect(lintText('El líder del grupo', 'es', rules)).toEqual(only('forbidden-term', 'líder'));
		expect(lintText('EL LÍDER', 'es', rules)).toEqual(only('forbidden-term', 'LÍDER'));
		expect(lintText('Lidera y liderazgo', 'es', rules)).toEqual([]);
	});

	it('uses the list of the text locale only', () => {
		expect(lintText('La mejor opción', 'en', rules)).toEqual([]);
		expect(lintText('The best option', 'es', rules)).toEqual([]);
	});

	it('a locale without a list has no forbidden terms and does not throw', () => {
		expect(lintText('The best option', 'fr', rules)).toEqual([]);
	});

	it('passes neutral wording', () => {
		expect(lintText('Assesses a published dataset that has a DOI.', 'en', rules)).toEqual([]);
		expect(lintText('Evalúa un conjunto de datos publicado.', 'es', rules)).toEqual([]);
	});
});

describe('lintText: voseo (es only)', () => {
	it.each(['tenés', 'podés', 'abrí', 'vos', 'querés', 'hacé'])('flags %s', (word) => {
		expect(lintText(`Si ${word} dudas`, 'es', rules)).toEqual(only('voseo', word));
	});

	it('flags several voseo forms in order', () => {
		expect(lintText('Si tenés dudas, podés escribir; abrí el enlace.', 'es', rules)).toEqual(
			only('voseo', 'tenés', 'podés', 'abrí')
		);
	});

	it('is case-insensitive and reports the text as written', () => {
		expect(lintText('TENÉS que ver. Abrí la página.', 'es', rules)).toEqual(
			only('voseo', 'TENÉS', 'Abrí')
		);
	});

	it('matches next to punctuation', () => {
		expect(lintText('¿Podés? Sí, abrí.', 'es', rules)).toEqual(only('voseo', 'Podés', 'abrí'));
	});

	it('matches whole words only', () => {
		expect(lintText('Sosa, vosotros, abrió y abría', 'es', rules)).toEqual([]);
	});

	it('does not apply to other locales', () => {
		expect(lintText('tenés podés abrí vos', 'en', rules)).toEqual([]);
		expect(lintText('tenés podés abrí vos', 'fr', rules)).toEqual([]);
	});

	it('passes formal Spanish (usted)', () => {
		expect(lintText('Abra el enlace y seleccione una opción.', 'es', rules)).toEqual([]);
	});
});

describe('lintText: informal tuteo (es only)', () => {
	it.each(['tienes', 'puedes', 'puedas', 'tú', 'quieres', 'necesitas'])('flags %s', (word) => {
		expect(lintText(`Si ${word} algo`, 'es', rules)).toEqual(only('informal', word));
	});

	it('flags several informal forms in order', () => {
		expect(lintText('Si tienes dudas, puedes escribir.', 'es', rules)).toEqual(
			only('informal', 'tienes', 'puedes')
		);
	});

	it('is case-insensitive', () => {
		expect(lintText('Tú puedes. TIENES razón.', 'es', rules)).toEqual(
			only('informal', 'Tú', 'puedes', 'TIENES')
		);
	});

	it('matches whole words only and keeps the possessive tu (no accent) apart from tú', () => {
		expect(lintText('Tu enlace, abrebocas, abreviatura', 'es', rules)).toEqual([]);
	});

	it('does not apply to other locales', () => {
		expect(lintText('tienes puedes tú', 'en', rules)).toEqual([]);
	});

	it('passes formal Spanish (usted)', () => {
		expect(lintText('Si tiene dudas, puede escribir.', 'es', rules)).toEqual([]);
	});

	it('voseo and informal are reported under their own rules in one text', () => {
		expect(lintText('Tenés y tienes', 'es', rules)).toEqual([
			{ rule: 'voseo', match: 'Tenés' },
			{ rule: 'informal', match: 'tienes' }
		]);
	});
});

describe('lintText: informal seed does not flag third person forms (decision 5)', () => {
	it('"abre" and "selecciona" describe a tool and are not flagged', () => {
		expect(lintText('La herramienta abre un informe y selecciona métricas', 'es', rules)).toEqual(
			[]
		);
	});

	it('the seed list in the valid fixture matches the decided list', () => {
		const files = loadFixtureFiles();
		expect(loadContent(files).site.style.informalWords).toEqual([
			'tú',
			'tienes',
			'puedes',
			'puedas',
			'quieres',
			'necesitas'
		]);
	});
});

describe('lintText: Unicode normalization (NFC)', () => {
	it('flags a decomposed "tú" (u plus combining acute)', () => {
		const decomposed = 'tu\u0301';
		expect(decomposed).not.toBe('tú');
		expect(lintText(`Si ${decomposed} puedes`, 'es', rules)).toEqual([
			{ rule: 'informal', match: 'tú' },
			{ rule: 'informal', match: 'puedes' }
		]);
	});

	it('the possessive "tu" without accent stays allowed', () => {
		expect(lintText('Tu enlace', 'es', rules)).toEqual([]);
	});

	it('matches a decomposed forbidden term with an accent', () => {
		expect(lintText('El li\u0301der del grupo', 'es', rules)).toEqual(
			only('forbidden-term', 'líder')
		);
	});

	it('matches decomposed voseo forms', () => {
		expect(lintText('Si tene\u0301s dudas', 'es', rules)).toEqual(only('voseo', 'ten\u00E9s'));
	});
});

describe('lintText: copyright, registered and flags', () => {
	const COPYRIGHT = String.fromCharCode(0x00a9);
	const REGISTERED = String.fromCharCode(0x00ae);
	const FLAG_ES = '\u{1F1EA}\u{1F1F8}';
	const FLAG_US = '\u{1F1FA}\u{1F1F8}';

	it('passes the real copyright and registered symbols', () => {
		expect(lintText(`FAIR${COPYRIGHT} and FAIR${REGISTERED}`, 'en', rules)).toEqual([]);
		expect(lintText(`${COPYRIGHT} 2026 FAIR${REGISTERED}`, 'es', rules)).toEqual([]);
	});

	it('passes the "(c)" style spelling', () => {
		expect(lintText('FAIR(c) and FAIR(r)', 'en', rules)).toEqual([]);
	});

	it('flags a flag emoji (regional indicator pair)', () => {
		expect(lintText(`Spain ${FLAG_ES}`, 'en', rules)).toEqual(only('emoji', FLAG_ES));
	});

	it('flags each flag as one match', () => {
		expect(lintText(`${FLAG_ES}${FLAG_US}`, 'en', rules)).toEqual(only('emoji', FLAG_ES, FLAG_US));
	});

	it('still flags other pictographic symbols', () => {
		expect(lintText(`Go ${ROCKET}${COPYRIGHT}`, 'en', rules)).toEqual(only('emoji', ROCKET));
	});
});

describe('lintText: forbidden term list drives matching (decision 8)', () => {
	const without_top: StyleRules = { ...rules, forbiddenTerms: { en: ['best'], es: [] } };
	const with_top: StyleRules = { ...rules, forbiddenTerms: { en: ['best', 'top'], es: [] } };

	it('"top-level domain" is not flagged when "top" is absent from the list', () => {
		expect(lintText('The top-level domain is .org', 'en', without_top)).toEqual([]);
		expect(lintText('The top-level domain is .org', 'en', rules)).toEqual([]);
	});

	it('a list entry is still matched as a whole word', () => {
		expect(lintText('A top result', 'en', with_top)).toEqual(only('forbidden-term', 'top'));
		expect(lintText('Topology and stopwatch', 'en', with_top)).toEqual([]);
	});
});

describe('lintText: combined rules', () => {
	it('reports each rule on its own match, in order of appearance', () => {
		expect(lintText(`The best ${GRINNING} :) a${EM_DASH}b`, 'en', rules)).toEqual([
			{ rule: 'forbidden-term', match: 'best' },
			{ rule: 'emoji', match: GRINNING },
			{ rule: 'emoticon', match: ':)' },
			{ rule: 'forbidden-character', match: EM_DASH }
		]);
	});

	it('an empty string has no violations', () => {
		expect(lintText('', 'en', rules)).toEqual([]);
		expect(lintText('', 'es', rules)).toEqual([]);
	});
});

describe('lintContent', () => {
	const valid = loadFixtureFiles();
	const lint = (files: Record<string, string>) => lintContent(loadContent(files));
	const hit = (file: string, path: string, rule: string, match: string) =>
		expect.objectContaining({ file, path, rule, match });

	it('the valid fixture has no violations (the style block itself is not linted)', () => {
		expect(lint(valid)).toEqual([]);
	});

	it('flags a forbidden term in en with the localized path', () => {
		const files = mutate(valid, 'content/tools/f-uji.yaml', (tool) => {
			tool.summary.en = 'The best checker.';
		});
		expect(lint(files)).toContainEqual(
			hit('content/tools/f-uji.yaml', 'summary.en', 'forbidden-term', 'best')
		);
	});

	it('flags voseo in es', () => {
		const files = mutate(valid, 'content/tools/f-uji.yaml', (tool) => {
			tool.summary.es = 'Si tenés dudas, escriba.';
		});
		expect(lint(files)).toContainEqual(
			hit('content/tools/f-uji.yaml', 'summary.es', 'voseo', 'tenés')
		);
	});

	it('flags informal tuteo in es', () => {
		const files = mutate(valid, 'content/tools/fair-enough.yaml', (tool) => {
			tool.summary.es = 'Si puedes, abra el enlace.';
		});
		expect(lint(files)).toContainEqual(
			hit('content/tools/fair-enough.yaml', 'summary.es', 'informal', 'puedes')
		);
	});

	it('also lints best_for', () => {
		const files = mutate(valid, 'content/tools/f-uji.yaml', (tool) => {
			tool.best_for.en = 'An ideal choice.';
		});
		expect(lint(files)).toContainEqual(
			hit('content/tools/f-uji.yaml', 'best_for.en', 'forbidden-term', 'ideal')
		);
	});

	it('flags an em dash, an emoji and an emoticon', () => {
		const files = mutate(valid, 'content/tools/f-uji.yaml', (tool) => {
			tool.output.en = `Report ${EM_DASH} JSON`;
			tool.output.es = `Informe ${GRINNING}`;
			tool.status_note.en = 'Works :)';
		});
		const found = lint(files);
		expect(found).toContainEqual(
			hit('content/tools/f-uji.yaml', 'output.en', 'forbidden-character', EM_DASH)
		);
		expect(found).toContainEqual(hit('content/tools/f-uji.yaml', 'output.es', 'emoji', GRINNING));
		expect(found).toContainEqual(
			hit('content/tools/f-uji.yaml', 'status_note.en', 'emoticon', ':)')
		);
	});

	it('reaches strings in list items of other files', () => {
		const sections = mutate(valid, 'content/sections.yaml', (list) => {
			list[0].intro.en = 'The best tools.';
		});
		expect(lint(sections)).toContainEqual(
			hit('content/sections.yaml', '0.intro.en', 'forbidden-term', 'best')
		);
		const finder = mutate(valid, 'content/finder.yaml', (doc) => {
			doc.rows[2].note.es = 'Si tenés un enlace.';
		});
		expect(lint(finder)).toContainEqual(
			hit('content/finder.yaml', 'rows.2.note.es', 'voseo', 'tenés')
		);
		const caveats = mutate(valid, 'content/caveats.yaml', (list) => {
			list[1].text.en = 'A leading result.';
		});
		expect(lint(caveats)).toContainEqual(
			hit('content/caveats.yaml', '1.text.en', 'forbidden-term', 'leading')
		);
		const taxonomy = mutate(valid, 'content/taxonomy.yaml', (doc) => {
			doc.mode[0].label.es = 'Automático :)';
		});
		expect(lint(taxonomy)).toContainEqual(
			hit('content/taxonomy.yaml', 'mode.0.label.es', 'emoticon', ':)')
		);
		const site = mutate(valid, 'content/site.yaml', (doc) => {
			doc.tagline.en = `Finder ${EN_DASH} directory`;
		});
		expect(lint(site)).toContainEqual(
			hit('content/site.yaml', 'tagline.en', 'forbidden-character', EN_DASH)
		);
	});

	it('uses the rules from site.yaml', () => {
		const files = mutate(valid, 'content/site.yaml', (doc) => {
			doc.style.forbiddenTerms.en.push('scalable');
		});
		const edited = mutate(files, 'content/tools/f-uji.yaml', (tool) => {
			tool.summary.en = 'A scalable checker.';
		});
		expect(lint(edited)).toContainEqual(
			hit('content/tools/f-uji.yaml', 'summary.en', 'forbidden-term', 'scalable')
		);
	});

	it('lints non-localized strings with locale independent rules only', () => {
		const dash = mutate(valid, 'content/tools/f-uji.yaml', (tool) => {
			tool.operator.name = `Operator ${EM_DASH} Unit`;
		});
		expect(lint(dash)).toContainEqual(
			hit('content/tools/f-uji.yaml', 'operator.name', 'forbidden-character', EM_DASH)
		);
		const product = mutate(valid, 'content/tools/f-uji.yaml', (tool) => {
			tool.name = 'Best Checker';
		});
		expect(lint(product)).toEqual([]);
	});

	it('returns nothing for text that is only in the style block', () => {
		const found = lint(valid);
		expect(found.filter((violation) => violation.file === 'content/site.yaml')).toEqual([]);
	});
});

describe('lintMessages', () => {
	it('flags violations with locale and key', () => {
		const found = lintMessages(
			{
				en: { greeting: 'The best start', ok: 'Hello' },
				es: { saludo: 'Si tenés dudas', ok: 'Hola' }
			},
			rules
		);
		expect(found).toContainEqual(
			expect.objectContaining({
				locale: 'en',
				key: 'greeting',
				rule: 'forbidden-term',
				match: 'best'
			})
		);
		expect(found).toContainEqual(
			expect.objectContaining({ locale: 'es', key: 'saludo', rule: 'voseo', match: 'tenés' })
		);
		expect(found).toHaveLength(2);
	});

	it('applies the rules of each locale only', () => {
		const found = lintMessages(
			{ en: { a: 'tenés tienes mejor' }, es: { a: 'best better' } },
			rules
		);
		expect(found).toEqual([]);
	});

	it('flags dashes, emoji and informal Spanish', () => {
		const found = lintMessages(
			{ en: { a: `x ${EM_DASH} y ${GRINNING}` }, es: { b: 'Puedes abrir' } },
			rules
		);
		expect(found).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ locale: 'en', key: 'a', rule: 'forbidden-character' }),
				expect.objectContaining({ locale: 'en', key: 'a', rule: 'emoji' }),
				expect.objectContaining({ locale: 'es', key: 'b', rule: 'informal', match: 'Puedes' })
			])
		);
		expect(found).toHaveLength(3);
	});

	it('passes clean messages and an empty catalogue', () => {
		expect(lintMessages({ en: { a: 'Hello {name}' }, es: { a: 'Hola {name}' } }, rules)).toEqual(
			[]
		);
		expect(lintMessages({}, rules)).toEqual([]);
	});
});
