import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createPrimitive, getDataForProcessing, getDataForImport } from '../SharedFunctions';
import Primitive from '../model/Primitive';
import Category from '../model/Category';
import Workspace from '../model/Workspace';
import Counter from '../model/Counter';
import { shutdownUsageTracker } from '../usage_tracker';

dotenv.config();

jest.setTimeout(30000);

let workspace;
let categoryA;
let categoryB;
let root;
let childResult;
let childEvidence;
let childOtherCategory;
let grandchild;
let otherGrandchild;
let importSource;
let importContainer;
let importItemA;
let importItemB;
let importItemOther;
let importNested;
let linkedResult;

beforeAll(async () => {
  mongoose.set('strictQuery', false);
  await mongoose.connect(process.env.MONGOOSE_URL, { serverSelectionTimeoutMS: 5000 });

  workspace = await Workspace.create({ title: 'Processing Test Workspace' });
  categoryA = await Category.create({ id: 12001, title: 'Category A' });
  categoryB = await Category.create({ id: 12002, title: 'Category B' });

  root = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryA.id,
      title: 'Root Result'
    },
    workspaceId: workspace.id
  });

  childResult = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryA.id,
      title: 'Child Result',
      referenceParameters: { score: 95 }
    },
    parent: root._id.toString(),
    workspaceId: workspace.id
  });

  childEvidence = await createPrimitive({
    data: {
      type: 'evidence',
      referenceId: categoryA.id,
      title: 'Child Evidence'
    },
    parent: root._id.toString(),
    workspaceId: workspace.id
  });

  childOtherCategory = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryB.id,
      title: 'Child Result Category B',
      referenceParameters: { score: 88 }
    },
    parent: root._id.toString(),
    workspaceId: workspace.id
  });

  grandchild = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryA.id,
      title: 'Grandchild Result'
    },
    parent: childResult._id.toString(),
    workspaceId: workspace.id
  });

  otherGrandchild = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryB.id,
      title: 'Other Category Grandchild'
    },
    parent: childResult._id.toString(),
    workspaceId: workspace.id
  });

  importSource = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryA.id,
      title: 'Import Source',
      referenceParameters: {
        target: 'items',
        type: 'result',
        referenceId: categoryA.id,
        descend: true
      }
    },
    workspaceId: workspace.id
  });

  importContainer = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryA.id,
      title: 'Import Container'
    },
    parent: importSource._id.toString(),
    workspaceId: workspace.id,
    paths: ['imports']
  });

  importItemA = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryA.id,
      title: 'Imported Result'
    },
    parent: importContainer._id.toString(),
    workspaceId: workspace.id
  });

  importItemB = await createPrimitive({
    data: {
      type: 'evidence',
      referenceId: categoryA.id,
      title: 'Imported Evidence'
    },
    parent: importContainer._id.toString(),
    workspaceId: workspace.id
  });

  importItemOther = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryB.id,
      title: 'Imported Other Result'
    },
    parent: importContainer._id.toString(),
    workspaceId: workspace.id
  });

  importNested = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryA.id,
      title: 'Nested Imported Result'
    },
    parent: importItemA._id.toString(),
    workspaceId: workspace.id
  });

  linkedResult = await createPrimitive({
    data: {
      type: 'result',
      referenceId: categoryA.id,
      title: 'Linked Result'
    },
    parent: root._id.toString(),
    workspaceId: workspace.id,
    paths: ['link']
  });

  // Refresh root so subsequent relationship lookups include the new link path.
  root = await Primitive.findById(root._id);
});

afterAll(async () => {
  shutdownUsageTracker();
  await Primitive.deleteMany({});
  await Category.deleteMany({ _id: { $in: [categoryA._id, categoryB._id] } });
  await Workspace.deleteMany({ _id: workspace._id });
  await Counter.deleteMany({});
  await mongoose.disconnect();
});

describe('getDataForProcessing', () => {
  test('returns immediate children filtered by type', async () => {
    const [list, titles] = await getDataForProcessing(
      root,
      { target: 'children', type: 'result', field: 'title' }
    );
    const ids = list.map((doc) => doc._id.toString()).sort();
    expect(ids).toEqual(
      [childResult._id.toString(), childOtherCategory._id.toString()].sort()
    );
    expect(titles.sort()).toEqual(
      [childResult.title, childOtherCategory.title].sort()
    );
  });

  test('supports descendant lookup filtered by referenceId set', async () => {
    const [list, titles] = await getDataForProcessing(
      root,
      { target: 'descend', referenceId: [categoryB.id], field: 'title' }
    );
    expect(list).toHaveLength(1);
    expect(list[0]._id.toString()).toBe(otherGrandchild._id.toString());
    expect(titles).toEqual([otherGrandchild.title]);
  });

  test('applies referenceId filtering for children targets', async () => {
    const [list, titles] = await getDataForProcessing(
      root,
      { target: 'children', referenceId: categoryB.id, field: 'title' }
    );
    expect(list).toHaveLength(1);
    expect(list[0]._id.toString()).toBe(childOtherCategory._id.toString());
    expect(titles).toEqual([childOtherCategory.title]);
  });

  test('uses configuration referenceId array filters when provided', async () => {
    const [list, titles] = await getDataForProcessing(
      root,
      {},
      undefined,
      { config: { target: 'children', referenceId: [categoryA.id], field: 'title' } }
    );
    expect(list).toHaveLength(1);
    expect(list[0]._id.toString()).toBe(childResult._id.toString());
    expect(titles).toEqual([childResult.title]);
  });

  test('action overrides can narrow results by type', async () => {
    const [list, titles] = await getDataForProcessing(
      root,
      { target: 'children', type: 'evidence', action_override: true, field: 'title' }
    );
    expect(list).toHaveLength(1);
    expect(list[0]._id.toString()).toBe(childEvidence._id.toString());
    expect(titles).toEqual([childEvidence.title]);
  });

  test('collects imported items via items target and childPrimitiveIds option', async () => {
    const [importedList, importedTitles] = await getDataForProcessing(
      importSource,
      { target: 'items', field: 'title' }
    );
    const importedIds = importedList.map((doc) => doc._id.toString()).sort();
    expect(importedIds).toEqual(
      [importItemA._id.toString(), importNested._id.toString()].sort()
    );
    expect(importedTitles.sort()).toEqual(
      [importItemA.title, importNested.title].sort()
    );

    const [restrictedList, restrictedTitles] = await getDataForProcessing(
      root,
      { target: 'children', field: 'title' },
      undefined,
      { childPrimitiveIds: [childResult._id.toString()] }
    );
    expect(restrictedList).toHaveLength(1);
    expect(restrictedList[0]._id.toString()).toBe(childResult._id.toString());
    expect(restrictedTitles).toEqual([childResult.title]);
  });

  test('param.* field extraction returns matching primitive values', async () => {
    const [paramList, paramValues] = await getDataForProcessing(
      root,
      { target: 'children', type: 'result', field: 'param.score' }
    );
    const ids = paramList.map((doc) => doc._id.toString()).sort();
    expect(ids).toEqual(
      [childResult._id.toString(), childOtherCategory._id.toString()].sort()
    );
    expect(paramValues.slice().sort((a, b) => Number(a) - Number(b))).toEqual([
      88,
      95
    ]);
  });

  test('resolves primitives from explicit path targets', async () => {
    const [pathList, pathTitles] = await getDataForProcessing(
      root,
      { target: 'path_origin', field: 'title' }
    );
    const ids = pathList.map((doc) => doc._id.toString()).sort();
    expect(ids).toEqual(
      [childResult._id.toString(), childEvidence._id.toString()].sort()
    );
    expect(pathTitles.sort()).toEqual(
      [childResult.title, childEvidence.title].sort()
    );
  });

  test('returns linked primitives from relationship paths', async () => {
    const [linkList, linkTitles] = await getDataForProcessing(
      root,
      { target: 'path_link', field: 'title' }
    );
    expect(linkList).toHaveLength(1);
    expect(linkList[0]._id.toString()).toBe(linkedResult._id.toString());
    expect(linkTitles).toEqual([linkedResult.title]);
  });

  test('can pivot retrieved items to their origin ancestors', async () => {
    const [pivotedList, pivotedTitles] = await getDataForProcessing(
      childResult,
      { target: 'descend', field: 'title' },
      undefined,
      {
        config: { target: 'descend', pivot: 1, pivotBy: 'origin' }
      }
    );

    expect(pivotedList).toHaveLength(1);
    expect(pivotedList[0]._id.toString()).toBe(childResult._id.toString());
    expect(pivotedTitles).toEqual([childResult.title]);
  });
});

describe('getDataForImport', () => {
  test('honors type and referenceId filters from configuration', async () => {
    const results = await getDataForImport(importSource);
    const ids = results.map((doc) => doc._id.toString()).sort();
    expect(ids).toEqual(
      [importItemA._id.toString(), importNested._id.toString()].sort()
    );
    const titles = results.map((doc) => doc.title).sort();
    expect(titles).toEqual(
      [importItemA.title, importNested.title].sort()
    );
  });

  test('descend option pulls nested descendants once per import source', async () => {
    const results = await getDataForImport(importSource, undefined, { forceImport: true });
    const ids = results.map((doc) => doc._id.toString());
    expect(ids).toEqual(
      expect.arrayContaining([
        importItemA._id.toString(),
        importNested._id.toString()
      ])
    );
    expect(ids).not.toEqual(expect.arrayContaining([importItemB._id.toString()]));
    expect(ids).not.toEqual(expect.arrayContaining([importItemOther._id.toString()]));
  });
});
