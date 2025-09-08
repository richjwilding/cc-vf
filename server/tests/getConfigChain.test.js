
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createPrimitive, getConfig } from '../SharedFunctions';
import * as SharedFunctions from '../SharedFunctions';
import * as InputHandler from '../InputHandler';
import Primitive from '../model/Primitive';
import Category from '../model/Category';
import Workspace from '../model/Workspace';
import { shutdownUsageTracker } from '../usage_tracker';

dotenv.config();

let mongod
let workspace;
let category;
let root;
let parent1;
let parent2;
let child;
let inputSource;

beforeAll(async () => {
  mongoose.set('strictQuery', false);
   await mongoose.connect(process.env.MONGOOSE_URL, { serverSelectionTimeoutMS: 5000 });

  workspace = await Workspace.create({ title: 'Test Workspace' });
  category = await Category.create({
    id: 9999,
    title: 'Test Category',
    parameters: {
      setting: { default: 'base' },
      ovr: { }
    },
    pins: { input: { setting: { info: true} } }
  });

  root = await createPrimitive({
    data: { type: 'result', referenceId: category.id },
    workspaceId: workspace.id
  });

  parent1 = await createPrimitive({
    data: { 
      type: 'result', 
      referenceId: category.id,
    },
    parent: root._id.toString(),
    paths: ["origin", "config"],
    workspaceId: workspace.id,
  });

  parent2 = await createPrimitive({
    data: { type: 'result', referenceId: category.id },
    workspaceId: workspace.id,
    parent: parent1._id.toString(),
      paths: ["origin", "config"]
  });

  child = await createPrimitive({
    data: { 
      type: 'result', 
      referenceId: category.id ,
    },
    parent: parent2._id.toString(),
    paths: ["origin", "config"],
    workspaceId: workspace.id,
  });

  inputSource = await createPrimitive({
    data: { 
      type: 'result', 
      referenceId: category.id 
    },
    workspaceId: workspace.id
  });
});

afterAll(async () => {
  shutdownUsageTracker()
  if (root && parent1 && parent2 && child && inputSource) {
    await Primitive.deleteMany({
      _id: { $in: [root._id, parent1._id, parent2._id, child._id, inputSource._id] }
    });
  }
  if (category) await Category.deleteOne({ _id: category._id });
  if (workspace) await Workspace.deleteOne({ _id: workspace._id });
  await mongoose.disconnect();
});

describe('getConfig inheritance', () => {
  test('defaults propagate through chain', async () => {
    const confRoot = await getConfig(root);
    const confP1 = await getConfig(parent1);
    const confP2 = await getConfig(parent2);
    const confChild = await getConfig(child);
    expect(confRoot.setting).toBe('base');
    expect(confP1.setting).toBe('base');
    expect(confP2.setting).toBe('base');
    expect(confChild.setting).toBe('base');
  });

  test('root local overrides default for descendants', async () => {
    root = await Primitive.findByIdAndUpdate(
      root._id,
      { referenceParameters: { setting: 'root' } },
      { new: true }
    );
    const confRoot = await getConfig(root);
    const confP1 = await getConfig(parent1);
    const confP2 = await getConfig(parent2);
    const confChild = await getConfig(child);
    expect(confRoot.setting).toBe('root');
    expect(confP1.setting).toBe('root');
    expect(confP2.setting).toBe('root');
    expect(confChild.setting).toBe('root');
  });

  test('parent1 local overrides root for descendants', async () => {
    parent1 = await Primitive.findByIdAndUpdate(
      parent1._id,
      { referenceParameters: { setting: 'p1' } },
      { new: true }
    );
    const confRoot = await getConfig(root);
    const confP1 = await getConfig(parent1);
    const confP2 = await getConfig(parent2);
    const confChild = await getConfig(child);
    expect(confRoot.setting).toBe('root');
    expect(confP1.setting).toBe('p1');
    expect(confP2.setting).toBe('p1');
    expect(confChild.setting).toBe('p1');
  });

  test('parent2 local overrides parent1', async () => {
    parent2 = await Primitive.findByIdAndUpdate(
      parent2._id,
      { referenceParameters: { setting: 'p2' } },
      { new: true }
    );
    const confRoot = await getConfig(root);
    const confP1 = await getConfig(parent1);
    const confP2 = await getConfig(parent2);
    const confChild = await getConfig(child);
    expect(confRoot.setting).toBe('root');
    expect(confP1.setting).toBe('p1');
    expect(confP2.setting).toBe('p2');
    expect(confChild.setting).toBe('p2');
  });

  test('input overrides ancestor config but not local', async () => {
    parent2 = await Primitive.findByIdAndUpdate(
      parent2._id,
      { 
        $set: { [`primitives.inputs.test_setting`]: [inputSource._id.toString()] },
      },
      { new: true }
    );


    console.log(parent2.primitives.inputs)

    const spy = jest
    .spyOn(InputHandler, 'fetchPrimitiveInputs')
    .mockResolvedValue({ setting: { data: 'input' } });
    const confRoot = await getConfig(root);
    const confP1 = await getConfig(parent1);
    const confP2 = await getConfig(parent2);
    const confChild = await getConfig(child);
    expect(confRoot.setting).toBe('root');
    expect(confP1.setting).toBe('p1');
    expect(confP2.setting).toBe('p2');
    expect(confChild.setting).toBe('p2');
    spy.mockRestore();
  });
  test('input overrides ancestor config when no local', async () => {
    parent2 = await Primitive.findByIdAndUpdate(
      parent2._id,
      { 
        $unset: {"referenceParameters.setting": true}
      },
      { new: true }
    );

    const spy = jest
    .spyOn(InputHandler, 'fetchPrimitiveInputs')
    .mockResolvedValue({ setting: { data: 'input' } });
    const confRoot = await getConfig(root);
    const confP1 = await getConfig(parent1);
    const confP2 = await getConfig(parent2);
    const confChild = await getConfig(child);
    expect(confRoot.setting).toBe('root');
    expect(confP1.setting).toBe('p1');
    expect(confP2.setting).toBe('input');
    expect(confChild.setting).toBe('input');
    spy.mockRestore();
  });

  test('child override beats ancestor override', async () => {
    child = await Primitive.findByIdAndUpdate(
      child._id,
      { 
        $set: { [`primitives.inputs.test_setting`]: [inputSource._id.toString()] },
      },
      { new: true }
    );
    const spy = jest.spyOn(InputHandler, 'fetchPrimitiveInputs')
        .mockImplementation(async (primitive) => {
          console.log(primitive._id.toString(), parent2._id.toString(), child._id.toString())
          if (primitive._id.toString() === parent2._id.toString()) {
            return { setting: { data: 'p2_input' } };
          }
          return { setting: { data: 'child_input' } };
        });

    const confRoot = await getConfig(root);
    const confP1 = await getConfig(parent1);
    const confP2 = await getConfig(parent2);
    const confChild = await getConfig(child);
    expect(confRoot.setting).toBe('root');
    expect(confP1.setting).toBe('p1');
    expect(confP2.setting).toBe('p2_input');
    expect(confChild.setting).toBe('child_input');
    spy.mockRestore();
  });

  test('child local overrides child input override', async () => {
    const spy = jest
      .spyOn(InputHandler, 'fetchPrimitiveInputs')
      .mockResolvedValue({ setting: { data: 'input' } });
    child = await Primitive.findByIdAndUpdate(
      child._id,
      { referenceParameters: { setting: 'child' } },
      { new: true }
    );
    const confRoot = await getConfig(root);
    const confP1 = await getConfig(parent1);
    const confP2 = await getConfig(parent2);
    const confChild = await getConfig(child);
    expect(confRoot.setting).toBe('root');
    expect(confP1.setting).toBe('p1');
    expect(confP2.setting).toBe('input');
    expect(confChild.setting).toBe('child');
    spy.mockRestore();
  });
});

