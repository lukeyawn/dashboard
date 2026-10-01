import './WordOfTheDayWidget.css';

export default function WordOfTheDayWidget({word, pinyin, definition}) {
    return (
        <div className="wotd-widget">
            <div className="wotd-pinyin">{pinyin}</div>
            <div className="wotd-hanzi" lang="zh-Hans" style={{'--chars': [...word].length}}>{word}</div>
            <div className="wotd-definition">{definition}</div>
        </div>
    );
}
