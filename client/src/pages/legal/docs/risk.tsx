/** Risk Disclosure & No Advice.
 *
 * New page, 2026-08-08 (gap GAP-008). The old Terms carried one generic paragraph written before
 * copy trading and published signals existed, so it warned about trading in general and said
 * nothing about the two things that actually carry the risk here.
 *
 * This page has to work standing alone: it is the one a regulator or a complaining user reads first.
 */
import { H2, P, DL, UL, Note, type Themed } from '../legalUI';

export default function Risk({ dm }: Themed) {
  return (
    <>
      <Note dm={dm} tone="warn">
        <strong>Most retail traders lose money.</strong> Trading foreign exchange, CFDs,
        cryptocurrencies, shares and commodities carries a high risk to your capital. Leverage
        multiplies losses as well as gains, and with some products you can lose more than you put in.
        Only use money you can afford to lose entirely.
      </Note>

      <H2 dm={dm}>1. We do not give advice, and we are not licensed to</H2>
      <DL dm={dm} items={[
        ['No personal recommendations.', 'Nothing we publish is tailored to you. We do not know your income, your obligations, your experience or what you are trying to achieve, so nothing we say can be suitable advice for you.'],
        ['No authorisation.', 'We do not hold, and do not claim to hold, any financial services licence, authorisation or registration in any country. We are a software provider, not a broker, adviser, fund manager or portfolio manager.'],
        ['No custody of your money.', 'Your funds stay with your own broker at all times. We never receive, hold or control them.'],
        ['Get real advice if you need it.', 'Before acting on anything you see here, consider speaking to someone licensed to advise in the country where you live.'],
      ]} />

      <H2 dm={dm}>2. Signals are educational, and here is what that means</H2>
      <P dm={dm}>
        We publish trade setups, including through Telegram. They exist to illustrate how a method is
        applied and to help you learn to read a chart. They are published to everyone who subscribes,
        identically, without regard to any individual's circumstances.
      </P>
      <UL dm={dm} items={[
        'A signal is not an instruction, a recommendation, or a prediction.',
        'We do not know whether a given setup is appropriate for you — that judgement is yours alone.',
        'We may hold, or take, positions consistent with anything we publish.',
        'Signals can be wrong, late, or superseded by events, and losing runs are a normal part of any method.',
        'If you act on one, you do so entirely at your own risk and on your own analysis.',
      ]} />

      <H2 dm={dm}>3. Copy trading carries its own risks</H2>
      <P dm={dm}>
        Copy trading means letting another user's decisions move your money automatically, without
        you approving each trade. It is the highest-risk feature on this platform.
      </P>
      <DL dm={dm} items={[
        ['We do not vet or endorse providers.', 'Any user may list an account. We do not select, verify, rank by merit, supervise or recommend them, and their appearance on the platform is not a view about their skill.'],
        ['A provider can change without warning.', 'They may increase risk, abandon a strategy, trade an instrument you did not expect, or suffer a large loss, at any moment.'],
        ['Performance figures describe the past only.', 'Where results are shown, they are what happened on that account over a stated period. They are not a forecast and not a promise. A strong record can be followed immediately by a severe loss.'],
        ['Your limits help, but do not protect you.', 'Position sizing and loss limits reduce exposure. Gaps, fast markets, weekend moves and outages can still take you past them.'],
        ['Execution is not guaranteed.', 'Copied orders can arrive late, at a different price, partially filled, or not at all, because of latency, broker rules, spreads or connectivity.'],
        ['Costs compound.', 'Spreads, commissions, swaps and slippage apply to every copied trade, and your net result will differ from the provider’s — often materially, and often for the worse.'],
      ]} />

      <H2 dm={dm}>4. Automated and AI-generated content</H2>
      <P dm={dm}>
        Analytics and AI commentary are produced automatically from data you entered. They can be
        wrong, incomplete or misleading, and they inherit any error in what was logged. Treat them as
        a prompt to think, never as a conclusion to act on.
      </P>

      <H2 dm={dm}>5. Your responsibility</H2>
      <UL dm={dm} items={[
        'Every order placed on your broker account is your responsibility, including orders placed automatically because you enabled copy trading.',
        'You are responsible for knowing whether these activities are lawful where you live, and for any tax you owe.',
        'If you do not understand a product, do not trade it.',
      ]} />

      <Note dm={dm}>
        Questions about anything on this page: <strong>legal@tradeandjournal.com</strong>.
      </Note>
    </>
  );
}
