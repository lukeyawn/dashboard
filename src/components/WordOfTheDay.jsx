export default function WordOfTheDay({word, pinyin, definition}) {
    return (
        <div class="wotd-widget">
            <div class="pinyin">{pinyin}</div>
            <div class="pinyin">{word}</div>
            <div class="pinyin">{definition}</div>
        </div>
    );
}