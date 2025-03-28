import { Shape, ShapeConfig } from 'konva/lib/Shape'
import { getNumberArrayValidator, getNumberValidator } from "konva/lib/Validators";
import { Factory } from "konva/lib/Factory";

const PI2 = Math.PI * 2;


function roundCornersPath(points, c, radius = 15) {

    function distance(a, b) {
        return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    }

    function direction(a, b, c) {
        const segment1Horizontal = a.y === b.y;
        const segment1Vertical = a.x === b.x;
        const segment2Horizontal = b.y === c.y;
        const segment2Vertical = b.x === c.x;

        if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
            return 'none';

        }else if (!(segment1Vertical || segment1Horizontal) ||
            !(segment2Vertical || segment2Horizontal)) {
            return 'unknown';

        }else if (segment1Horizontal && segment2Vertical) {
            return c.y > b.y ? 's' : 'n';

        }else{
            return c.x > b.x ? 'e' : 'w';
        }

    }

    function simplifyPath(points) {
        if (points.length <= 4) {
            return [
                {x: points[0], y: points[1]},
                {x: points[2], y: points[3]}
            ];
        }
        const r = [{x: points[0], y: points[1]}];
        for (let i = 2; i < points.length; i += 2) {
            const cur = {x: points[i], y: points[i + 1]}
            
            if (i === (points.length - 2)) {
                r.push(cur);
                
            }else if(direction({x: points[i - 2], y: points[i - 1]}, cur, {x: points[i + 2], y: points[i + 3]}) !== 'none'){
                r.push(cur);
            }
        }
        return r;
    }

    function trace(points, radius){
        
        if (points.length <= 1) return;

        c.beginPath();
        c.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1],
                  current = points[i], { x, y } = current,
                  next = points[i + 1];

            if (next) {
                const d1 = distance(prev, current), d2 = distance(current, next),
                      r2 = radius * 2, r = d1 < r2 || d2 < r2 ? Math.min(d1 / 2, d2 / 2) : radius,
                      fromW = prev.x < x, fromN = prev.y < y;
                switch (direction(prev, current, next)) {
                    case 's':
                        c.lineTo(fromW ? x - r : x + r, y);
                        c.quadraticCurveTo(x, y, x, y + r);
                        break;
                    case 'n':
                        c.lineTo(fromW ? x - r : x + r, y);
                        c.quadraticCurveTo(x, y, x, y - r);
                        break;
                    case 'e':
                        c.lineTo(x, fromN ? y - r : y + r);
                        c.quadraticCurveTo(x, y, x + r, y);
                        break;
                    case 'w':
                        c.lineTo(x, fromN ? y - r : y + r);
                        c.quadraticCurveTo(x, y, x - r, y);
                        break;
                    default:
                        c.lineTo(x, y);
                        break;
                }
            }else {
                c.lineTo(current.x, current.y);
            }
        }
    }

    trace(simplifyPath(points), radius);
}

class RoundedArrow extends Shape {
    constructor(attrs) {
        super({
            radius: 15,
            ...attrs
        });
      }


      

      // Method to draw the rounded polyline
    _sceneFunc(ctx, shape) {
        let points = shape.points()
        if( this.attrs.direct ){
            const n = points.length
            ctx.moveTo(points[0],points[1]);
            ctx.lineTo(points[n-2],points[n-1]);

            ctx.strokeShape(shape);
            return
        }
        roundCornersPath( points, ctx, this.attrs.radius)
        ctx.strokeShape(shape);

        if (this.pointerAtEnding()) {
            const n = points.length
            const dx = points[n - 2] - points[n - 4];
            const dy = points[n - 1] - points[n - 3];
            const hyp = Math.hypot(dx,dy)
            const radians = (Math.atan2(dy, dx) + PI2) % PI2;
            if( hyp > this.pointerLength()){

                const length = this.pointerLength();
                const width = this.pointerWidth();
                ctx.save();
                ctx.beginPath();
                ctx.translate(points[n - 2], points[n - 1]);
                ctx.rotate(radians);
                ctx.moveTo(0, 0);
                ctx.lineTo(-length, width / 2);
                ctx.lineTo(-length, -width / 2);
                ctx.closePath();
                ctx.restore();
                ctx.fillStrokeShape(this);
            }
          }

      }
    }
Factory.addGetterSetter(RoundedArrow, 'pointerLength', 10, getNumberValidator());
Factory.addGetterSetter(RoundedArrow, 'pointerWidth', 10, getNumberValidator());
Factory.addGetterSetter(RoundedArrow, 'direct', false)
Factory.addGetterSetter(RoundedArrow, 'points', [], getNumberArrayValidator());
Factory.addGetterSetter(RoundedArrow, 'pointerAtEnding', true);

export default RoundedArrow;