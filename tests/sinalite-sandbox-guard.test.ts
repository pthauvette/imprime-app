/**
 * Alerte « SINALITE_API_BASE pointe sur le sandbox en production ».
 *
 * POURQUOI. `src/lib/sinalite/client.ts` donne à `SINALITE_API_BASE` un défaut
 * qui EST le sandbox. Oublier la variable dans la console Amplify ne provoque
 * donc aucune erreur : l'app démarre, sert des prix, encaisse des paiements —
 * et les commandes payées ne partent jamais en fabrication. Le pire mode
 * d'échec du lot, parce que tout a l'air de marcher.
 *
 * Décision Patrick (2026-08-10) : ALERTER, ne pas refuser le démarrage. Le
 * check `config:env` n'étant pas critique, son échec devient un `warn` global
 * en HTTP 200 — visible dans /api/health et les logs, sans faire chuter l'uptime
 * ni bloquer un déploiement qui précède la pose de la variable.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inspectEnvConfig } from '@/lib/config/env-health';

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL };
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('en production', () => {
  beforeEach(() => {
    // @ts-expect-error — NODE_ENV est en lecture seule dans les types Node.
    process.env.NODE_ENV = 'production';
  });

  it('signale un pointage explicite sur le sandbox', () => {
    process.env.SINALITE_API_BASE = 'https://api.sinaliteuppy.com';
    expect(inspectEnvConfig().sinaliteSandboxEnProd).toBe(true);
  });

  it("signale l'ABSENCE de la variable — le défaut du code est le sandbox", () => {
    // C'est le cas réel : personne n'écrit l'URL du sandbox à la main, on
    // oublie simplement de poser la variable.
    delete process.env.SINALITE_API_BASE;
    expect(inspectEnvConfig().sinaliteSandboxEnProd).toBe(true);
  });

  it('traite une variable VIDE comme absente', () => {
    // `FOO=` est un mode d'échec réel du pipeline `sed` d'amplify.yml.
    process.env.SINALITE_API_BASE = '   ';
    expect(inspectEnvConfig().sinaliteSandboxEnProd).toBe(true);
  });

  it('se tait quand la base live est posée', () => {
    process.env.SINALITE_API_BASE = 'https://liveapi.sinalite.com';
    expect(inspectEnvConfig().sinaliteSandboxEnProd).toBe(false);
  });

  it("ne regarde PAS SINALITE_AUTH_BASE — son host sandbox est légitime", () => {
    // Le endpoint de jeton vit sur api.sinaliteuppy.com y compris en
    // production (changelog Sinalite du 2021/07/27). Étendre le contrôle à
    // cette variable produirait une alerte permanente, donc plus lue.
    process.env.SINALITE_API_BASE = 'https://liveapi.sinalite.com';
    process.env.SINALITE_AUTH_BASE = 'https://api.sinaliteuppy.com';
    expect(inspectEnvConfig().sinaliteSandboxEnProd).toBe(false);
  });
});

describe('hors production', () => {
  it("ne signale rien — dev et CI travaillent contre le sandbox, c'est voulu", () => {
    // @ts-expect-error — NODE_ENV est en lecture seule dans les types Node.
    process.env.NODE_ENV = 'development';
    process.env.SINALITE_API_BASE = 'https://api.sinaliteuppy.com';
    expect(inspectEnvConfig().sinaliteSandboxEnProd).toBe(false);
  });
});
