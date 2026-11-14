// Human movement: acceleration + friction (no instant stops), crouch, jump,
// ADS slowdown. Collision is axis-resolved AABBs from collision.js. The camera
// is synced from this body each render; recoil is applied to pitch/yaw here.
import { PLAYER } from './config.js';
import { moveBody } from './collision.js';
import { clamp } from './rng.js';

export function createPlayerController(player, collision) {
  const stepLen = { acc: 0 };
  return {
    player,
    step(dt, keys, onStep) {
      const p = player;
      const crouch = keys.has('ControlLeft') || keys.has('ControlRight');
      p.crouch = crouch;
      const ads = p.ads;
      const maxSpeed = crouch ? PLAYER.crouchSpeed : ads ? PLAYER.adsSpeed : PLAYER.walkSpeed;
      const sin = Math.sin(p.yaw);
      const cos = Math.cos(p.yaw);
      let ix = 0;
      let iz = 0;
      if (keys.has('KeyW')) { ix += -sin; iz += -cos; }
      if (keys.has('KeyS')) { ix += sin; iz += cos; }
      if (keys.has('KeyA')) { ix += -cos; iz += sin; }
      if (keys.has('KeyD')) { ix += cos; iz += -sin; }
      const len = Math.hypot(ix, iz);
      if (len > 0) { ix /= len; iz /= len; }
      p.vel.x += ix * PLAYER.accel * dt;
      p.vel.z += iz * PLAYER.accel * dt;
      // Friction: strong when no input, light while driving.
      const fric = len > 0 ? 2.2 : PLAYER.friction;
      const f = Math.max(0, 1 - fric * dt);
      p.vel.x *= f;
      p.vel.z *= f;
      const speed = Math.hypot(p.vel.x, p.vel.z);
      if (speed > maxSpeed) {
        p.vel.x *= maxSpeed / speed;
        p.vel.z *= maxSpeed / speed;
      }
      // Gravity + jump.
      p.vel.y -= PLAYER.gravity * dt;
      if (keys.has('Space') && p.grounded) {
        p.vel.y = PLAYER.jumpSpeed;
        p.grounded = false;
      }
      const beforeY = p.pos.y;
      moveBody(collision, p.pos, { x: p.vel.x * dt, y: p.vel.y * dt, z: p.vel.z * dt },
        PLAYER.radius, crouch ? PLAYER.crouchHeight : PLAYER.height);
      if (p.pos.y === 0) {
        p.vel.y = 0;
        p.grounded = true;
      } else if (p.pos.y !== beforeY + p.vel.y * dt) {
        p.vel.y = 0;
      }
      // Footsteps for audio + the step counter.
      stepLen.acc += speed * dt;
      if (stepLen.acc > 2.4 && p.grounded && speed > 1) {
        stepLen.acc = 0;
        if (onStep) onStep(crouch);
      }
    },
    look(dx, dy) {
      const p = player;
      p.yaw -= dx * 0.0022;
      p.pitch = clamp(p.pitch - dy * 0.0022, -1.45, 1.45);
    },
    recoil(pitchKick, yawKick) {
      const p = player;
      p.pitch = clamp(p.pitch + pitchKick, -1.45, 1.45);
      p.yaw += yawKick;
    },
    eyeHeight() {
      return player.crouch ? PLAYER.eyeCrouch : PLAYER.eyeStand;
    },
    speed() {
      return Math.hypot(player.vel.x, player.vel.z);
    },
  };
}
