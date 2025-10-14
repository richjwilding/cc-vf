import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  addRelationship,
  addRelationshipToMultiple,
  removeRelationship,
  removeRelationshipFromMultiple,
} from '../../SharedFunctions';
import Primitive from '../../model/Primitive';
import Workspace from '../../model/Workspace';
import Category from '../../model/Category';

jest.mock('../../socket', () => ({
  SIO: {
    notifyPrimitiveEvent: jest.fn(),
  },
}));

const { SIO } = jest.requireMock('../../socket');

jest.setTimeout(120000);

let mongoServer;
let workspace;
let workspaceId;
let flowCategory;
let stepCategory;
let genericCategory;

const loadPrimitive = async (id) => Primitive.findById(id).lean();

const setupFlowHierarchy = async () => {
  const parentFlowDef = await Primitive.create({
    type: 'flow',
    referenceId: flowCategory.id,
    workspaceId,
    primitives: {},
    parentPrimitives: {},
    flowElement: true,
  });

  const subFlowDef = await Primitive.create({
    type: 'flow',
    referenceId: flowCategory.id,
    workspaceId,
    primitives: {},
    parentPrimitives: { [parentFlowDef.id]: ['primitives.subfi'] },
    flowElement: true,
  });

  const parentStepDef = await Primitive.create({
    type: 'action',
    referenceId: stepCategory.id,
    workspaceId,
    primitives: {},
    parentPrimitives: { [parentFlowDef.id]: ['primitives.origin'] },
    flowElement: true,
  });

  const [parentFlowInstanceOne, parentFlowInstanceTwo] = await Primitive.create([
    {
      type: 'flowinstance',
      referenceId: flowCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: { [parentFlowDef.id]: ['primitives.origin'] },
    },
    {
      type: 'flowinstance',
      referenceId: flowCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: { [parentFlowDef.id]: ['primitives.origin'] },
    },
  ]);

  const [
    subFlowInstanceOneA,
    subFlowInstanceOneB,
    subFlowInstanceTwo,
  ] = await Primitive.create([
    {
      type: 'flowinstance',
      referenceId: flowCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {
        [subFlowDef.id]: ['primitives.origin'],
        [parentFlowInstanceOne.id]: ['primitives.subfi'],
      },
    },
    {
      type: 'flowinstance',
      referenceId: flowCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {
        [subFlowDef.id]: ['primitives.origin'],
        [parentFlowInstanceOne.id]: ['primitives.subfi'],
      },
    },
    {
      type: 'flowinstance',
      referenceId: flowCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {
        [subFlowDef.id]: ['primitives.origin'],
        [parentFlowInstanceTwo.id]: ['primitives.subfi'],
      },
    },
  ]);

  const [parentStepInstanceOne, parentStepInstanceTwo] = await Primitive.create([
    {
      type: 'action',
      referenceId: stepCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {
        [parentStepDef.id]: ['primitives.config'],
        [parentFlowInstanceOne.id]: ['primitives.origin'],
      },
    },
    {
      type: 'action',
      referenceId: stepCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {
        [parentStepDef.id]: ['primitives.config'],
        [parentFlowInstanceTwo.id]: ['primitives.origin'],
      },
    },
  ]);

  await Primitive.updateOne(
    { _id: parentFlowDef._id },
    {
      $set: {
        'primitives.config': [parentFlowInstanceOne.id, parentFlowInstanceTwo.id],
        'primitives.subfi': [subFlowDef.id],
      },
    },
  );

  await Primitive.updateOne(
    { _id: subFlowDef._id },
    {
      $set: {
        'primitives.config': [
          subFlowInstanceOneA.id,
          subFlowInstanceOneB.id,
          subFlowInstanceTwo.id,
        ],
      },
    },
  );

  await Primitive.updateOne(
    { _id: parentStepDef._id },
    {
      $set: {
        'primitives.config': [parentStepInstanceOne.id, parentStepInstanceTwo.id],
      },
    },
  );

  return {
    parentFlowDefId: parentFlowDef.id,
    subFlowDefId: subFlowDef.id,
    parentStepDefId: parentStepDef.id,
    parentFlowInstanceIds: [parentFlowInstanceOne.id, parentFlowInstanceTwo.id],
    subFlowInstanceIds: {
      first: [subFlowInstanceOneA.id, subFlowInstanceOneB.id],
      second: [subFlowInstanceTwo.id],
    },
    subFlowInstanceAll: [
      subFlowInstanceOneA.id,
      subFlowInstanceOneB.id,
      subFlowInstanceTwo.id,
    ],
    parentStepInstanceIds: [parentStepInstanceOne.id, parentStepInstanceTwo.id],
  };
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  mongoose.set('strictQuery', false);
  await mongoose.connect(mongoServer.getUri(), { dbName: 'relationship-tests' });

  workspace = await Workspace.create({ title: 'Primitive Relationship Tests' });
  workspaceId = workspace._id.toString();

  [flowCategory, stepCategory, genericCategory] = await Category.create([
    { id: 80101, title: 'Flow Definition' },
    { id: 80102, title: 'Flow Step' },
    { id: 80103, title: 'Generic Primitive' },
  ]);
});

afterAll(async () => {
  await Primitive.deleteMany({});
  await Category.deleteMany({ _id: { $in: [flowCategory._id, stepCategory._id, genericCategory._id] } });
  await Workspace.deleteOne({ _id: workspace._id });

  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Primitive.deleteMany({});
  SIO.notifyPrimitiveEvent.mockClear();
});

describe('Primitive relationship helpers', () => {
  // Validates the basic parent/child wiring: when a primitive is linked we expect both
  // `parentPrimitives` and `primitives` to reflect the relationship and reject double adds.
  test('addRelationship creates a two-way link and prevents duplicates', async () => {
    const parent = await Primitive.create({
      type: 'board',
      referenceId: genericCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {},
    });

    const child = await Primitive.create({
      type: 'result',
      referenceId: genericCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {},
    });

    await addRelationship(parent.id, child.id, 'imports');

    let updatedParent = await loadPrimitive(parent.id);
    let updatedChild = await loadPrimitive(child.id);

    expect(updatedParent.primitives?.imports).toEqual([child.id]);
    expect(updatedChild.parentPrimitives?.[parent.id]).toEqual(['primitives.imports']);

    await addRelationship(parent.id, child.id, 'imports');

    updatedParent = await loadPrimitive(parent.id);
    updatedChild = await loadPrimitive(child.id);

    expect(updatedParent.primitives?.imports).toEqual([child.id]);
    expect(updatedChild.parentPrimitives?.[parent.id]).toEqual(['primitives.imports']);
  });

  // Confirms that removing a relationship clears the references on both sides so no stale
  // parent/child pointers remain on either primitive document.
  test('removeRelationship detaches both parent and child references', async () => {
    const parent = await Primitive.create({
      type: 'board',
      referenceId: genericCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {},
    });

    const child = await Primitive.create({
      type: 'result',
      referenceId: genericCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {},
    });

    await addRelationship(parent.id, child.id, 'imports');

    await removeRelationship(parent.id, child.id, 'imports');

    const updatedParent = await loadPrimitive(parent.id);
    const updatedChild = await loadPrimitive(child.id);

    expect(updatedParent.primitives?.imports).toBeUndefined();
    expect(updatedChild.parentPrimitives?.[parent.id]).toBeUndefined();
  });

  // Exercises the bulk add helper to ensure every target receives the parent reference and
  // the parent primitive lists each newly linked child exactly once.
  test('addRelationshipToMultiple links all targets and updates parentPrimitives', async () => {
    const receiver = await Primitive.create({
      type: 'board',
      referenceId: genericCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {},
    });

    const targets = await Primitive.create([
      { type: 'result', referenceId: genericCategory.id, workspaceId, primitives: {}, parentPrimitives: {} },
      { type: 'result', referenceId: genericCategory.id, workspaceId, primitives: {}, parentPrimitives: {} },
      { type: 'result', referenceId: genericCategory.id, workspaceId, primitives: {}, parentPrimitives: {} },
    ]);

    const targetIds = targets.map((doc) => doc.id);

    await addRelationshipToMultiple(receiver.id, targetIds, 'results.main', workspaceId);

    const updatedReceiver = await loadPrimitive(receiver.id);
    expect(updatedReceiver.primitives?.results?.main).toEqual(expect.arrayContaining(targetIds));
    expect(updatedReceiver.primitives?.results?.main).toHaveLength(targetIds.length);

    const refreshedTargets = await Primitive.find({ _id: { $in: targetIds } }).lean();
    refreshedTargets.forEach((target) => {
      expect(target.parentPrimitives?.[receiver.id]).toEqual(['primitives.results.main']);
    });
  });

  // Mirrors the bulk add case, verifying that the multi-remove helper cleans up every
  // linkage so parents and children end up fully detached.
  test('removeRelationshipFromMultiple removes each link symmetrically', async () => {
    const receiver = await Primitive.create({
      type: 'board',
      referenceId: genericCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {},
    });

    const targets = await Primitive.create([
      { type: 'result', referenceId: genericCategory.id, workspaceId, primitives: {}, parentPrimitives: {} },
      { type: 'result', referenceId: genericCategory.id, workspaceId, primitives: {}, parentPrimitives: {} },
    ]);

    const targetIds = targets.map((doc) => doc.id);

    await addRelationshipToMultiple(receiver.id, targetIds, 'results.secondary', workspaceId);

    await removeRelationshipFromMultiple(receiver.id, targetIds, 'results.secondary', workspaceId);

    const updatedReceiver = await loadPrimitive(receiver.id);
    expect(updatedReceiver.primitives?.results).toBeUndefined();

    const refreshedTargets = await Primitive.find({ _id: { $in: targetIds } }).lean();
    refreshedTargets.forEach((target) => {
      expect(target.parentPrimitives?.[receiver.id]).toBeUndefined();
    });
  });

  // Ensures the flow cascade creates matching instance-level links (and removes them) so
  // running flow instances inherit the structural relationships of their definitions.
  test('addRelationship cascades to flow instances and removeRelationship reverses it', async () => {
    const flowDef = await Primitive.create({
      type: 'flow',
      referenceId: flowCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {},
      flowElement: true,
    });

    const flowInstance = await Primitive.create({
      type: 'flowinstance',
      referenceId: flowCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: { [flowDef.id]: ['primitives.origin'] },
    });

    await Primitive.updateOne(
      { _id: flowDef._id },
      { $set: { 'primitives.config': [flowInstance.id] } },
    );

    const stepDef = await Primitive.create({
      type: 'action',
      referenceId: stepCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: { [flowDef.id]: ['primitives.origin'] },
      flowElement: true,
    });

    const stepInstance = await Primitive.create({
      type: 'action',
      referenceId: stepCategory.id,
      workspaceId,
      primitives: {},
      parentPrimitives: {
        [stepDef.id]: ['primitives.config'],
        [flowInstance.id]: ['primitives.origin'],
      },
    });

    await Primitive.updateOne(
      { _id: stepDef._id },
      { $set: { 'primitives.config': [stepInstance.id] } },
    );

    await addRelationship(flowDef.id, stepDef.id, 'outputs.main');

    let updatedFlowDef = await loadPrimitive(flowDef.id);
    let updatedStepDef = await loadPrimitive(stepDef.id);
    let updatedFlowInstance = await loadPrimitive(flowInstance.id);
    let updatedStepInstance = await loadPrimitive(stepInstance.id);

    expect(updatedFlowDef.primitives?.outputs?.main).toEqual([stepDef.id]);
    expect(updatedStepDef.parentPrimitives?.[flowDef.id]).toEqual(
      expect.arrayContaining(['primitives.origin', 'primitives.outputs.main']),
    );

    expect(updatedFlowInstance.primitives?.outputs?.main).toEqual([stepInstance.id]);
    expect(updatedStepInstance.parentPrimitives?.[flowInstance.id]).toContain('primitives.outputs.main');

    await removeRelationship(flowDef.id, stepDef.id, 'outputs.main');

    updatedFlowDef = await loadPrimitive(flowDef.id);
    updatedStepDef = await loadPrimitive(stepDef.id);
    updatedFlowInstance = await loadPrimitive(flowInstance.id);
    updatedStepInstance = await loadPrimitive(stepInstance.id);

    expect(updatedFlowDef.primitives?.outputs).toBeUndefined();
    expect(updatedStepDef.parentPrimitives?.[flowDef.id]).toEqual(['primitives.origin']);

    expect(updatedFlowInstance.primitives?.outputs).toBeUndefined();
    expect(updatedStepInstance.parentPrimitives?.[flowInstance.id]).toEqual(['primitives.origin']);
  });

  // Verifies that when a flow imports a subflow, each parent flow instance receives outputs
  // from its own child subflow instances by aligning on the shared ancestor step instance.
  test('flow imports cascade to descendant flow instances using ancestor alignment', async () => {
    const {
      parentFlowDefId,
      subFlowDefId,
      parentFlowInstanceIds,
      subFlowInstanceIds,
    } = await setupFlowHierarchy();

    await addRelationship(parentFlowDefId, subFlowDefId, 'imports');

    const refreshedParentInstances = await Primitive.find({
      _id: { $in: parentFlowInstanceIds },
    }).lean();
    const refreshedSubFlowInstances = await Primitive.find({
      _id: {
        $in: [...subFlowInstanceIds.first, ...subFlowInstanceIds.second],
      },
    }).lean();

    const parentMap = new Map(
      refreshedParentInstances.map((doc) => [doc._id.toString(), doc]),
    );
    const firstParent = parentMap.get(parentFlowInstanceIds[0]);
    const secondParent = parentMap.get(parentFlowInstanceIds[1]);
    expect(firstParent.primitives?.imports).toEqual(
      expect.arrayContaining(subFlowInstanceIds.first),
    );
    expect(firstParent.primitives?.imports).toHaveLength(
      subFlowInstanceIds.first.length,
    );

    expect(secondParent.primitives?.imports).toEqual(
      expect.arrayContaining(subFlowInstanceIds.second),
    );
    expect(secondParent.primitives?.imports).toHaveLength(
      subFlowInstanceIds.second.length,
    );

    const firstParentId = parentFlowInstanceIds[0];
    refreshedSubFlowInstances
      .filter((inst) => subFlowInstanceIds.first.includes(inst._id.toString()))
      .forEach((inst) => {
        expect(inst.parentPrimitives?.[firstParentId]).toEqual(
          expect.arrayContaining([
            'primitives.subfi',
            'primitives.imports',
          ]),
        );
      });

    const secondParentId = parentFlowInstanceIds[1];
    refreshedSubFlowInstances
      .filter((inst) => subFlowInstanceIds.second.includes(inst._id.toString()))
      .forEach((inst) => {
        expect(inst.parentPrimitives?.[secondParentId]).toEqual(
          expect.arrayContaining([
            'primitives.subfi',
            'primitives.imports',
          ]),
        );
      });
  });

  // Checks that step inputs within a flow select the subflow instance that corresponds to
  // the same ancestor step, so data imported into a step is sourced from the right run.
  test('flow inputs map subflow instances to the correct ancestor step instances', async () => {
    const {
      subFlowDefId,
      parentStepDefId,
      subFlowInstanceIds,
      parentStepInstanceIds,
    } = await setupFlowHierarchy();

    await addRelationship(subFlowDefId, parentStepDefId, 'inputs.main');

    const refreshedSubFlows = await Primitive.find({
      _id: { $in: [...subFlowInstanceIds.first, ...subFlowInstanceIds.second] },
    }).lean();
    const refreshedParentSteps = await Primitive.find({
      _id: { $in: parentStepInstanceIds },
    }).lean();

    refreshedSubFlows
      .filter((inst) => subFlowInstanceIds.first.includes(inst._id.toString()))
      .forEach((inst) => {
        expect(inst.primitives?.inputs?.main).toEqual(
          [parentStepInstanceIds[0]],
        );
      });

    refreshedSubFlows
      .filter((inst) => subFlowInstanceIds.second.includes(inst._id.toString()))
      .forEach((inst) => {
        expect(inst.primitives?.inputs?.main).toEqual(
          [parentStepInstanceIds[1]],
        );
      });

    refreshedParentSteps.forEach((step) => {
      const expectedSources =
        step._id.toString() === parentStepInstanceIds[0]
          ? subFlowInstanceIds.first
          : subFlowInstanceIds.second;

      expectedSources.forEach((sourceId) => {
        expect(step.parentPrimitives?.[sourceId]).toContain(
          'primitives.inputs.main',
        );
      });
    });
  });

  // Confirms that subflow outputs bubble results back to each parent step instance sharing
  // the same ancestor alignment, giving the parent flow the aggregate data it expects.
  test('flow outputs aggregate the correct parent step instances for each subflow instance', async () => {
    const {
      subFlowDefId,
      parentStepDefId,
      subFlowInstanceIds,
      parentStepInstanceIds,
    } = await setupFlowHierarchy();

    await addRelationship(subFlowDefId, parentStepDefId, 'outputs.main');

    const refreshedSubFlows = await Primitive.find({
      _id: { $in: [...subFlowInstanceIds.first, ...subFlowInstanceIds.second] },
    }).lean();
    const refreshedParentSteps = await Primitive.find({
      _id: { $in: parentStepInstanceIds },
    }).lean();

    refreshedSubFlows
      .filter((inst) => subFlowInstanceIds.first.includes(inst._id.toString()))
      .forEach((inst) => {
        expect(inst.primitives?.outputs?.main).toEqual(
          [parentStepInstanceIds[0]],
        );
      });

    refreshedSubFlows
      .filter((inst) => subFlowInstanceIds.second.includes(inst._id.toString()))
      .forEach((inst) => {
        expect(inst.primitives?.outputs?.main).toEqual(
          [parentStepInstanceIds[1]],
        );
      });

    refreshedParentSteps.forEach((step) => {
      const expectedSources =
        step._id.toString() === parentStepInstanceIds[0]
          ? subFlowInstanceIds.first
          : subFlowInstanceIds.second;

      expectedSources.forEach((sourceId) => {
        expect(step.parentPrimitives?.[sourceId]).toContain(
          'primitives.outputs.main',
        );
      });
    });
  });
});

