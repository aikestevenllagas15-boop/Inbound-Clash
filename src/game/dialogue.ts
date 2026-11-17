import type { FighterId } from './types';

export interface DialogueExchange {
  p1: string;
  p2: string;
}

const MATCHUP_DIALOGUES: Record<FighterId, Record<FighterId, DialogueExchange[]>> = {
  kael: {
    kael: [
      {
        p1: 'Copy my embers all you want—only one flame burns brightest.',
        p2: 'Careful, spark. Stand too close and you will catch fire.',
      },
      {
        p1: 'A mirror match? Good. Double the heat in here!',
        p2: 'Let us see whose blaze turns the other to ash first.',
      },
    ],
    veyra: [
      {
        p1: 'Your wind only feeds my fire, speedster!',
        p2: 'You have to hit me first, slowpoke—try keeping up.',
      },
      {
        p1: 'Stand still for one second and feel a Meteor Slam!',
        p2: 'Blink once and I am already behind you, Ember.',
      },
    ],
    bram: [
      {
        p1: 'Even solid iron melts when I turn up the furnace.',
        p2: 'A wildfire cannot crack the mountain, boy.',
      },
      {
        p1: 'Hope that shield of yours is heat-resistant, Bram.',
        p2: 'Swing your hottest punch. I will not budge an inch.',
      },
    ],
    sora: [
      {
        p1: 'Fire versus lightning—let us light up the whole sky!',
        p2: 'My blade cuts cleaner than wild flames. Draw your guard.',
      },
      {
        p1: 'Think your storm blade can parry an Inferno Nova?',
        p2: 'I only need one clean strike to end your blaze.',
      },
    ],
    lyra: [
      {
        p1: 'Hope that frost holds up against a real blaze!',
        p2: 'Watch how quickly ice turns reckless fire into steam.',
      },
      {
        p1: 'One Fireball Surge and your glacier is history.',
        p2: 'Careful, Kael. You are stepping into absolute zero.',
      },
    ],
    hecker: [
      {
        p1: 'Put the laptop down and fight with your fists!',
        p2: 'Hold on—just pushing a thermal throttling patch to you.',
      },
      {
        p1: 'Can your code block a fist full of solar fire?',
        p2: 'Sure can. Already rerouted your firewall.',
      },
    ],
  },

  veyra: {
    kael: [
      {
        p1: 'Try not to burn yourself swinging at empty air, Kael.',
        p2: 'Laugh all you want—my flames cover the whole floor!',
      },
      {
        p1: 'Wind beats fire when I never give you a target.',
        p2: 'One lucky hit is all I need to ground you!',
      },
    ],
    veyra: [
      {
        p1: 'Two tempests in one arena? This is going to get dizzy.',
        p2: 'Whoever lands the first Flash Step owns the wind.',
      },
      {
        p1: 'Let us see which gale breaks the sound barrier first!',
        p2: 'Hope you brought your reflexes—I never hold back.',
      },
    ],
    bram: [
      {
        p1: 'You look heavy, Bram. Ready to chase a hurricane?',
        p2: 'Speed fades fast when a boulder drops on your path.',
      },
      {
        p1: 'I can circle that bastion three times before you blink!',
        p2: 'Then circle carefully. One crush and you are done.',
      },
    ],
    sora: [
      {
        p1: 'Let us race the wind against your lightning, Ronin.',
        p2: 'Lightning strikes faster than any gust, Veyra.',
      },
      {
        p1: 'Try catching me in a Cyclone Trap if you can!',
        p2: 'Come close enough to strike and you will meet my parry.',
      },
    ],
    lyra: [
      {
        p1: 'Frozen air just makes my tailwinds slice sharper!',
        p2: 'Even the fastest breeze stops dead inside Permafrost.',
      },
      {
        p1: 'You cannot freeze a shadow you cannot tag, Lyra.',
        p2: 'Wait until the blizzard covers the entire stage.',
      },
    ],
    hecker: [
      {
        p1: 'No script can track my footsteps, hacker!',
        p2: 'Funny—my packet tracker already locked your coordinates.',
      },
      {
        p1: 'Typing fast will not save you from a Skybreak Barrage!',
        p2: 'Just watch me throttle your dash speed to zero.',
      },
    ],
  },

  bram: {
    kael: [
      {
        p1: 'Wild sparks bounce right off forged stone, Kael.',
        p2: 'Then I will hit you hard enough to crack the bedrock!',
      },
      {
        p1: 'Come test your fists against the Iron Bastion.',
        p2: 'Gladly—time to see how a titan handles the heat!',
      },
    ],
    veyra: [
      {
        p1: 'Zip around all you like. Every storm hits stone eventually.',
        p2: 'Only if you can actually turn around in time, Bram!',
      },
      {
        p1: 'My Tectonic Crater does not care how fast you run.',
        p2: 'Good luck landing it while I am mid-air!',
      },
    ],
    bram: [
      {
        p1: 'Only one bastion walks out of this quake standing.',
        p2: 'Let us shake the arena down to its foundations!',
      },
      {
        p1: 'Armor versus armor—no tricks, just pure impact.',
        p2: 'Now that is a clash worthy of iron!',
      },
    ],
    sora: [
      {
        p1: 'Steel and lightning will not dent this stone guard.',
        p2: 'Every fortress has a crack, Bram. I will find yours.',
      },
      {
        p1: 'Try parrying a mountain hurled straight at your blade.',
        p2: 'A clean edge splits even bedrock in two.',
      },
    ],
    lyra: [
      {
        p1: 'Your frost will only temper my armor harder, Lyra.',
        p2: 'Even stone shatters once it freezes to the core.',
      },
      {
        p1: 'Cold air cannot stop a seismic hammer.',
        p2: 'Let us test that weight against Absolute Blizzard.',
      },
    ],
    hecker: [
      {
        p1: 'You cannot hack solid granite with a keyboard, kid.',
        p2: 'You would be surprised what a System Hijack cracks open.',
      },
      {
        p1: 'Step away from that screen and face a real heavyweight.',
        p2: 'Heavyweight means huge hitbox. Thanks for the free data!',
      },
    ],
  },

  sora: {
    kael: [
      {
        p1: 'Steady your stance, Kael. Wild fire leaves openings.',
        p2: 'Talk less, Ronin—my flames do not wait for duels!',
      },
      {
        p1: 'Storm steel against ember fists. Show me your best.',
        p2: 'Watch out, Sora—this heat hits harder than lightning!',
      },
    ],
    veyra: [
      {
        p1: 'Your speed is impressive, Veyra. Stay sharp.',
        p2: 'Save the compliments for after I outrun your bolts!',
      },
      {
        p1: 'A gale cannot outpace Judgment Skyfall.',
        p2: 'Try hitting the wind before it knocks you skyward!',
      },
    ],
    bram: [
      {
        p1: 'Strength without speed leaves you open to my blade, Bram.',
        p2: 'Speed means nothing if you bounce off my Aegis Guard.',
      },
      {
        p1: 'Prepare yourself, Titan. The storm is coming down.',
        p2: 'Bring the thunder. I have weathered worse.',
      },
    ],
    sora: [
      {
        p1: 'Same blade, same storm. Let us settle who is sharper.',
        p2: 'One mistimed Thunder Counter decides everything.',
      },
      {
        p1: 'Respect the stance—now show me your true voltage!',
        p2: 'May the cleaner strike claim victory.',
      },
    ],
    lyra: [
      {
        p1: 'Ice conducts lightning better than you think, Lyra.',
        p2: 'Only if your blade is not frozen mid-swing first.',
      },
      {
        p1: 'Let us see if your frost outlasts my Arc Bolt.',
        p2: 'Precision beats haste—watch your footing.',
      },
    ],
    hecker: [
      {
        p1: 'No firewall can parry a blade of lightning.',
        p2: 'Cute sword. Too bad your firmware is outdated.',
      },
      {
        p1: 'Drop the tricks and cross blades with honor, Hecker.',
        p2: 'Honor does not patch a zero-day exploit, Ronin.',
      },
    ],
  },

  lyra: {
    kael: [
      {
        p1: 'Your flames burn loud, Kael—and burn out fast.',
        p2: 'Then I will melt your ice before the timer ticks!',
      },
      {
        p1: 'Cool down before you get frozen solid.',
        p2: 'Not a chance! Bring on your worst blizzard!',
      },
    ],
    veyra: [
      {
        p1: 'All that wind will only carry my frost straight to you.',
        p2: 'Catch me first, Alchemist—if you can track my trail!',
      },
      {
        p1: 'Even a tempest slows to a crawl in sub-zero air.',
        p2: 'Good thing I never stay in one spot for long!',
      },
    ],
    bram: [
      {
        p1: 'Heavy armor freezes fastest, Bram. Brace yourself.',
        p2: 'Freeze my shell all you like—I still hit like a landslide.',
      },
      {
        p1: 'Careful where you stomp—glacier shards cut deep.',
        p2: 'I crush glaciers for breakfast, Weaver.',
      },
    ],
    sora: [
      {
        p1: 'Do not blink, Ronin—my frost steals your momentum.',
        p2: 'One flash of thunder shatters any ice cage.',
      },
      {
        p1: 'A calm mind beats frantic lightning every time.',
        p2: 'My blade is calmer than your winter storm.',
      },
    ],
    lyra: [
      {
        p1: 'Two frost weavers? Careful—the air is dropping fast.',
        p2: 'Let us see whose crystal edge stays sharper.',
      },
      {
        p1: 'An icy mirror match calls for flawless timing.',
        p2: 'Do not slip—this arena just became a skating rink.',
      },
    ],
    hecker: [
      {
        p1: 'Let us see how your laptop runs in sub-zero weather.',
        p2: 'Free liquid cooling! My CPU has never boosted faster.',
      },
      {
        p1: 'Try hacking through solid permafrost, Phantom.',
        p2: 'Already bypassed your cold boot security, Lyra.',
      },
    ],
  },

  hecker: {
    kael: [
      {
        p1: 'Warning: your aggression stats look dangerously unpatched, Kael.',
        p2: 'Less typing, more fighting—eat a Fireball Surge!',
      },
      {
        p1: 'Careful, Ember—one Packet Flood drains your whole ult bar.',
        p2: 'I do not need energy bars to knock that laptop flying!',
      },
    ],
    veyra: [
      {
        p1: 'Nice dash speed. Mind if I inject a little lag?',
        p2: 'Try clicking send before I kick that keyboard in half!',
      },
      {
        p1: 'My homing packets love fast-moving targets.',
        p2: 'Wait until you try dodging a real Cyclone Trap!',
      },
    ],
    bram: [
      {
        p1: 'Big shield, Bram. Let me run System Hijack on it real quick.',
        p2: 'Hit me with toys if you want. My boulder still crushes.',
      },
      {
        p1: 'You bring the rocks, I will bring the root access.',
        p2: 'No computer survives a Tectonic Crater, hacker.',
      },
    ],
    sora: [
      {
        p1: 'Voltage blade, huh? Hope you backed up your surge protector.',
        p2: 'Keep talking and my Arc Bolt will fry that circuit board.',
      },
      {
        p1: 'Let us test your Ronin reflexes against a System Override.',
        p2: 'A true warrior reads the duel, not a screen.',
      },
    ],
    lyra: [
      {
        p1: 'Frost magic? Sweet—free overclock cooling for my rig.',
        p2: 'Wait until Permafrost freezes your keys shut.',
      },
      {
        p1: 'Running a quick thermal override on your blizzard.',
        p2: 'Try debugging a Glacier Lance at point-blank range.',
      },
    ],
    hecker: [
      {
        p1: 'Wait—who cloned my repo and stole my hoodie?!',
        p2: 'Relax, I am just running a live stress test on us.',
      },
      {
        p1: 'There is only room for one root admin in this arena.',
        p2: 'May the cleaner script win. Sudo duel!',
      },
    ],
  },
};

export function selectIntroDialogue(
  p1Id: FighterId,
  p2Id: FighterId,
  rng: () => number,
): DialogueExchange {
  const pool = MATCHUP_DIALOGUES[p1Id][p2Id];
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx];
}
