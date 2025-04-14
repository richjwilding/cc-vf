import Konva from 'konva'
import { Factory } from 'konva/lib/Factory';
import { _registerNode } from 'konva/lib/Global'
import { Shape, ShapeConfig } from 'konva/lib/Shape'
import { getNumberValidator } from 'konva/lib/Validators';



class WedgeRing extends Konva.Wedge {
    constructor(config) {
        super(config);
    }
  _sceneFunc(context) {
    const innerRadius = this.attrs.innerRadius;
    const outerRadius = this.attrs.outerRadius;
    const angleRad = Konva.getAngle (this.attrs.angle); // convert to radians

    context.beginPath();

    // Outer arc (from 0 to angle)
    context.arc(0, 0, outerRadius, 0, angleRad, false);

    // Inner arc (from angle back to 0, reversed)
    context.arc(0, 0, innerRadius, angleRad, 0, true);

    context.closePath();
    context.fillStrokeShape(this);
  }
}
WedgeRing.prototype.className = 'WedgeRing';
_registerNode(WedgeRing);

Factory.addGetterSetter(WedgeRing, 'innerRadius', 0, getNumberValidator());
Factory.addGetterSetter(WedgeRing, 'outerRadius', 0, getNumberValidator());


export default WedgeRing;