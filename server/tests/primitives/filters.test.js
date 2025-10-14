import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../../socket', () => ({
  SIO: {
    notifyPrimitiveEvent: jest.fn(),
  },
}));

jest.mock('../../actions/getConfigFromDB.js', () => ({
  getConfigFromDB: jest.fn(async (primitive) => primitive.referenceParameters ?? {}),
}));

import { getDataForImport, getDataForProcessing } from '../../SharedFunctions';
import Primitive from '../../model/Primitive';
import Workspace from '../../model/Workspace';
import Category from '../../model/Category';

const { SIO } = jest.requireMock('../../socket');

jest.setTimeout(120000);

let mongoServer;
let workspace;
let workspaceId;
let resultCategory;
let altCategory;
let evidenceCategory;
let importSource;
let importContainer;
let segmentA;
let segmentB;
let question;
let prompt;
let items;

const reloadImportSource = () => Primitive.findById(importSource._id);

const applyImportConfig = async (importConfig, overrides = {}) => {
  await Primitive.updateOne(
    { _id: importSource._id },
    {
      $set: {
        referenceParameters: {
          target: 'items',
          type: 'result',
          ...overrides,
          importConfig,
        },
      },
    },
  );
};

const listTitles = (docs) => docs.map((doc) => doc.title).sort();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  workspace = await Workspace.create({ title: 'Primitive Filter Workspace' });
  workspaceId = workspace._id.toString();

  resultCategory = await Category.create({ id: 31001, title: 'Result Category' });
  altCategory = await Category.create({ id: 31002, title: 'Alt Result Category' });
  evidenceCategory = await Category.create({ id: 31003, title: 'Evidence Category' });

  importSource = await Primitive.create({
    type: 'result',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Import Source',
    primitives: {},
    referenceParameters: { target: 'items', type: 'result' },
    parentPrimitives: {},
  });

  segmentA = await Primitive.create({
    type: 'segment',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Segment A',
    primitives: {},
    parentPrimitives: {},
  });

  segmentB = await Primitive.create({
    type: 'segment',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Segment B',
    primitives: {},
    parentPrimitives: {},
  });

  question = await Primitive.create({
    type: 'question',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Question Node',
    primitives: {},
    parentPrimitives: {},
  });

  prompt = await Primitive.create({
    type: 'prompt',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Prompt Node',
    primitives: {},
    parentPrimitives: {
      [question.id]: ['primitives.auto'],
    },
  });

  importContainer = await Primitive.create({
    type: 'segment',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Import Container',
    primitives: {},
    parentPrimitives: {
      [importSource.id]: ['primitives.imports'],
    },
  });

  const alpha = await Primitive.create({
    type: 'result',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Alpha Insight',
    primitives: {},
    referenceParameters: { score: 92, status: 'approved' },
    parentPrimitives: {
      [importContainer.id]: ['primitives.origin'],
      [segmentA.id]: ['primitives.auto'],
    },
  });

  const beta = await Primitive.create({
    type: 'result',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Beta Insight',
    primitives: {},
    referenceParameters: { score: 45, status: 'pending' },
    parentPrimitives: {
      [importContainer.id]: ['primitives.origin'],
      [segmentB.id]: ['primitives.auto'],
    },
  });

  const gamma = await Primitive.create({
    type: 'result',
    referenceId: altCategory.id,
    workspaceId,
    title: 'Gamma Insight',
    primitives: {},
    referenceParameters: { score: 80 },
    parentPrimitives: {
      [importContainer.id]: ['primitives.origin'],
      [segmentA.id]: ['primitives.auto'],
    },
  });

  const delta = await Primitive.create({
    type: 'result',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Delta Insight',
    primitives: {},
    referenceParameters: { score: null },
    parentPrimitives: {
      [importContainer.id]: ['primitives.origin'],
    },
  });

  const epsilon = await Primitive.create({
    type: 'result',
    referenceId: resultCategory.id,
    workspaceId,
    title: 'Prompt Answer',
    primitives: {},
    referenceParameters: { score: 75 },
    parentPrimitives: {
      [importContainer.id]: ['primitives.origin'],
      [segmentB.id]: ['primitives.auto'],
      [prompt.id]: ['primitives.origin'],
    },
  });

  items = { alpha, beta, gamma, delta, epsilon };

  await Primitive.updateOne(
    { _id: importSource._id },
    {
      $set: {
        primitives: {
          imports: [importContainer.id],
        },
      },
    },
  );
});

afterAll(async () => {
  await Primitive.deleteMany({});
  await Category.deleteMany({ _id: { $in: [resultCategory._id, altCategory._id, evidenceCategory._id].filter(Boolean) } });
  await Workspace.deleteMany({ _id: workspace._id });

  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  SIO.notifyPrimitiveEvent.mockClear();
});

describe('primitive filter handling for imports', () => {
  // Validates that the parent filter limits imports to primitives linked to the given
  // ancestor, mirroring how flows scope their selectable children in the UI.
  test('filters imports by parent relationships', async () => {
    await applyImportConfig([
      {
        id: importContainer.id,
        filters: [
          { type: 'parent', value: segmentA.id, pivot: 1, relationship: ['auto'] },
        ],
      },
    ]);

    const source = await reloadImportSource();
    const results = await getDataForImport(source);

    expect(listTitles(results)).toEqual(['Alpha Insight', 'Gamma Insight']);
  });

  // Exercises parameter range filtering (including inclusive-null behaviour) so processing
  // requests can target primitives with matching parameter values or empty slots.
  test('applies parameter range filters with null inclusion via getDataForProcessing', async () => {
    await applyImportConfig([
      {
        id: importContainer.id,
        filters: [
          {
            type: 'parameter',
            param: 'score',
            value: [
              { min_value: 80, max_value: 100 },
              undefined,
            ],
            pivot: 0,
            relationship: ['origin'],
          },
        ],
      },
    ]);

    const source = await reloadImportSource();
    const [list, titles] = await getDataForProcessing(source, { target: 'items' });

    expect(listTitles(list)).toEqual(['Alpha Insight', 'Delta Insight', 'Gamma Insight']);
    expect(titles.sort()).toEqual(['Alpha Insight', 'Delta Insight', 'Gamma Insight']);
  });

  // Ensures the title filter honours the `not` flag to exclude matches—used when flows
  // need every primitive except the ones already chosen by name.
  test('supports inverted title filtering for imports', async () => {
    await applyImportConfig([
      {
        id: importContainer.id,
        filters: [
          {
            type: 'title',
            value: 'Beta Insight',
            pivot: 0,
            relationship: ['origin'],
            invert: true,
          },
        ],
      },
    ]);

    const source = await reloadImportSource();
    const results = await getDataForImport(source);

    expect(listTitles(results)).toEqual([
      'Alpha Insight',
      'Delta Insight',
      'Gamma Insight',
      'Prompt Answer',
    ]);
    expect(results.map((doc) => doc.title)).not.toContain('Beta Insight');
  });

  // Confirms the type filter (which really targets `referenceId`) can scope queries to a
  // specific category, matching how the UI narrows primitives by type.
  test('filters by referenceId using type filter', async () => {
    await applyImportConfig([
      {
        id: importContainer.id,
        filters: [
          {
            type: 'type',
            value: [altCategory.id],
            pivot: 0,
            relationship: ['origin'],
          },
        ],
      },
    ]);

    const source = await reloadImportSource();
    const results = await getDataForImport(source);

    expect(listTitles(results)).toEqual(['Gamma Insight']);
  });

  // Verifies the question filter brings back only response primitives tied to the given
  // question ids, allowing downstream steps to reuse survey answers selectively.
  test('selects responses linked to specific questions', async () => {
    await applyImportConfig([
      {
        id: importContainer.id,
        filters: [
          {
            type: 'question',
            subtype: 'question',
            map: [question.id],
            pivot: 1,
            relationship: ['origin'],
          },
        ],
      },
    ]);

    const source = await reloadImportSource();
    const results = await getDataForImport(source);

    expect(listTitles(results)).toEqual(['Prompt Answer']);
  });
});
