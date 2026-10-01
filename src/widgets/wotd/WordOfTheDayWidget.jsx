import words from '../../data/words.json';
import { daysBetween, today } from '../../../shared/dates';
import { useNow } from '../../hooks/useNow';
import './WordOfTheDayWidget.css';

// The same word all day, everywhere, with nothing stored (DESIGN §10)
export default function WordOfTheDayWidget() {
    const daysSinceEpoch = daysBetween('1970-01-01', today(useNow()));
    const { hanzi, pinyin, definition } = words[daysSinceEpoch % words.length];
    return (
        <div className="wotd-widget">
            <div className="wotd-pinyin">{pinyin}</div>
            <div className="wotd-hanzi" lang="zh-Hans" style={{'--chars': [...hanzi].length}}>{hanzi}</div>
            <div className="wotd-definition">{definition}</div>
        </div>
    );
}
