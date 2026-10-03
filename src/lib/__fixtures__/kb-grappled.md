# Movement-Restricting Conditions

Mechanical effects of Grappled, Prone, and Restrained: speed reduced to 0, crawling movement, attack disadvantage/advantage interactions, Dexterity save disadvantage, grappler drag/carry rules.

Three conditions reduce or eliminate a creature's ability to move freely: **Grappled**, **Prone**, and **Restrained**. All three exist in both the 2014 and 2024 rules; key differences are noted below.

## Grappled

**2024:** Speed is reduced to 0 and cannot increase [1]. The grappled creature has Disadvantage on attack rolls against any target other than the grappler [1]. The grappler can drag or carry the grappled creature when it moves, but every foot of movement costs the grappler 1 extra foot, unless the grappled creature is Tiny or two or more sizes smaller than the grappler [1].

**2014:** Speed becomes 0 and cannot benefit from any bonus to speed [2]. The condition ends if the grappler becomes Incapacitated [2]. The condition also ends if an effect removes the grappled creature from the grappler's reach (e.g., being hurled away by *thunderwave*) [2].

> **Edition difference:** The 2024 version adds attack Disadvantage against non-grapplers and codifies drag/carry movement costs. The 2014 version spells out the two termination triggers (grappler incapacitated; forced separation) but does not impose attack penalties.

For the rules on how to initiate or escape a grapple, see combat/grappling_and_shoving.

---

## Prone

**2024 movement:** The only movement options while Prone are crawling (costs 1 extra foot per foot moved) or spending movement equal to half your Speed (rounded down) to stand up and end the condition. If Speed is 0, you cannot stand up. You can drop Prone without using any movement [3][4].

**2024 attacks:** Disadvantage on attack rolls. Attack rolls against you have Advantage if the attacker is within 5 feet; otherwise those attack rolls have Disadvantage [3].

**2014:** A prone creature can only crawl or stand up (standing ends the condition). Disadvantage on attack rolls. Attack rolls against the creature have Advantage if the attacker is within 5 feet; otherwise Disadvantage [5].

> **Edition difference:** The 2024 rule explicitly states that dropping prone costs no movement, and that standing costs half Speed rounded down. The 2014 rule omits the explicit cost formula for standing.

---

## Restrained

**2024:** Speed is 0 and cannot increase [6]. Attack rolls against the restrained creature have Advantage; the creature's own attack rolls have Disadvantage [6]. The creature has Disadvantage on Dexterity saving throws [6].

**2014:** Speed becomes 0; cannot benefit from any bonus to speed [7]. Attack rolls against the creature have Advantage; the creature's attack rolls have Disadvantage [7]. Disadvantage on Dexterity saving throws [7].

> **Edition difference:** Effects are functionally identical across both editions. The 2024 phrasing uses "Speed" (capitalised) and "can't increase" rather than "can't benefit from any bonus."

---

## Quick-reference summary

| Condition | Speed | Own attacks | Attacks against | Saves |
|-----------|-------|-------------|-----------------|-------|
| Grappled (2024) | 0 (no increase) | Disadvantage vs. non-grappler | No change | No change |
| Grappled (2014) | 0 (no bonus) | No change | No change | No change |
| Prone | 0 not imposed; crawling only | Disadvantage | Advantage ≤5 ft; Disadvantage >5 ft | No change |
| Restrained | 0 (no increase) | Disadvantage | Advantage | Dex saves: Disadvantage |

For incapacitating conditions that also reduce Speed to 0 (Paralyzed, Stunned, Unconscious), see conditions/incapacitating.

## Sources

1. Grappled — Dataset
2. Grappled — Dataset
3. Prone — Dataset
4. Prone — Dataset
5. Being Prone — Dataset
6. Restrained — Dataset
7. Restrained — Dataset


---

# Grappling and Shoving

Grapple and shove as unarmed strike options, saving throw DCs, contested checks, escape mechanics, size limits, and knocking targets prone

Grappling and shoving are special unarmed strike options available when you take the Attack action. Both share the same size restriction: the target must be no more than one size larger than you and within your reach.

## Grappling

### 2024 Rules
Grappling is an Unarmed Strike option. Instead of an attack roll, the target makes a **Strength or Dexterity saving throw** (its choice) against **DC 8 + your Strength modifier + Proficiency Bonus**. On a failure, the target gains the Grappled condition. [1]

**Escaping:** A grappled creature can use its action to escape by making a **Strength (Athletics) or Dexterity (Acrobatics) check** against the same DC (8 + your Strength modifier + Proficiency Bonus). [1]

### 2014 Rules
Grappling uses the Attack action and replaces one attack if you have multiple. You use at least one free hand and make a **Strength (Athletics) check contested by the target's Strength (Athletics) or Dexterity (Acrobatics) check** (target chooses). On success, the target gains the Grappled condition. You can release the target whenever you like at no action cost. [2]

**Escaping:** A grappled creature uses its action and makes a **Strength (Athletics) or Dexterity (Acrobatics) check contested by your Strength (Athletics) check**. [2]

## Shoving

### 2024 Rules
Shoving is an Unarmed Strike option. The target makes a **Strength or Dexterity saving throw** against **DC 8 + your Strength modifier + Proficiency Bonus**. On a failure, you choose to either **push it 5 feet away** or **knock it Prone**. [3]

### 2014 Rules
Shoving uses the Attack action and replaces one attack if you have multiple. You make a **Strength (Athletics) check contested by the target's Strength (Athletics) or Dexterity (Acrobatics) check** (target chooses). On winning the contest, you either **knock the target Prone** or **push it 5 feet away**. [4]

## Key Differences Between Editions

| Feature | 2024 | 2014 |
|---|---|---|
| Mechanic | Saving throw (DC 8 + Str mod + PB) | Contested ability check |
| Target chooses | Which save stat (Str or Dex) | Which skill (Athletics or Acrobatics) |
| Escape DC (grapple) | Fixed DC (same formula) | Contested by grappler's Athletics |
| Free hand required | Not specified | Yes (grapple only) |

For the Grappled condition's full effects (movement restrictions, etc.), see `conditions`. For general attack roll rules, see `combat/attack_rolls_and_damage`.

## Sources

1. Grappling — Dataset
2. Grappling — Dataset
3. Shoving — Dataset
4. Shoving — Dataset

