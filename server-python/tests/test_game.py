"""Unit tests for Room game logic (game.py)."""

import pytest
from game import DRAW_SECS, GamePhase, Room


class TestCanStart:
    def test_single_player_cannot_start(self, room: Room):
        ok, err = room.can_start()
        assert not ok
        assert "至少需要" in err

    def test_two_players_can_start(self, room_with_two: Room):
        ok, err = room_with_two.can_start()
        assert ok
        assert err == ""

    def test_cannot_start_during_game(self, room_with_two: Room):
        room_with_two.start_game()
        ok, err = room_with_two.can_start()
        assert not ok
        assert "进行中" in err

    def test_can_start_after_game_over(self, room_with_two: Room):
        room_with_two.start_game()
        room_with_two.phase = GamePhase.GAME_OVER
        ok, err = room_with_two.can_start()
        assert ok


class TestStartGame:
    def test_resets_scores(self, room_with_two: Room):
        room_with_two.players[0].score = 100
        room_with_two.start_game()
        for p in room_with_two.players:
            assert p.score == 0

    def test_resets_has_drawn(self, room_with_two: Room):
        room_with_two.players[0].has_drawn = True
        room_with_two.start_game()
        for p in room_with_two.players:
            assert not p.has_drawn

    def test_sets_total_rounds(self, room_with_two: Room):
        room_with_two.start_game()
        assert room_with_two.total_rounds == 2

    def test_enters_new_round(self, room_with_two: Room):
        room_with_two.start_game()
        assert room_with_two.phase == GamePhase.NEW_ROUND
        assert room_with_two.current_round == 1
        assert len(room_with_two.word_options) == 3

    def test_first_drawer_is_connected_and_not_drawn(self, room_with_two: Room):
        room_with_two.start_game()
        assert room_with_two.current_drawer_id in {p.id for p in room_with_two.players}


class TestSelectWord:
    def test_selects_word_and_transitions_to_drawing(self, room_with_two: Room):
        room_with_two.start_game()
        drawer_id = room_with_two.current_drawer_id
        word = room_with_two.select_word(drawer_id, 0)
        assert word == room_with_two.word
        assert room_with_two.phase == GamePhase.DRAWING
        assert room_with_two.seconds_left == DRAW_SECS

    def test_wrong_drawer_rejected(self, room_with_two: Room):
        room_with_two.start_game()
        drawer_id = room_with_two.current_drawer_id
        other = next(p.id for p in room_with_two.players if p.id != drawer_id)
        with pytest.raises(ValueError, match="画手"):
            room_with_two.select_word(other, 0)

    def test_wrong_phase_rejected(self, room: Room):
        with pytest.raises(ValueError, match="选词阶段"):
            room.select_word("owner1", 0)

    def test_invalid_index_rejected(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        with pytest.raises(ValueError, match="无效选项"):
            room_with_two.select_word(drawer, 99)


class TestSubmitGuess:
    def test_correct_guess_first_gets_30(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        other = next(p.id for p in room_with_two.players if p.id != drawer)
        word = room_with_two.select_word(drawer, 0)

        score = room_with_two.submit_guess(other, word)
        assert score == 30
        assert room_with_two.players[1].score == 30

    def test_correct_guess_second_gets_20(self, room_with_three: Room):
        room_with_three.start_game()
        drawer = room_with_three.current_drawer_id
        others = [p.id for p in room_with_three.players if p.id != drawer]
        word = room_with_three.select_word(drawer, 0)

        score1 = room_with_three.submit_guess(others[0], word)
        assert score1 == 30
        score2 = room_with_three.submit_guess(others[1], word)
        assert score2 == 20

    def test_drawer_cannot_guess(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        room_with_two.select_word(drawer, 0)
        with pytest.raises(ValueError, match="画手不能猜词"):
            room_with_two.submit_guess(drawer, room_with_two.word)

    def test_wrong_guess_returns_none(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        other = next(p.id for p in room_with_two.players if p.id != drawer)
        room_with_two.select_word(drawer, 0)

        result = room_with_two.submit_guess(other, "完全不对的词")
        assert result is None

    def test_duplicate_guess_returns_none(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        other = next(p.id for p in room_with_two.players if p.id != drawer)
        word = room_with_two.select_word(drawer, 0)

        room_with_two.submit_guess(other, word)  # first guess = correct
        result = room_with_two.submit_guess(other, word)  # duplicate
        assert result is None

    def test_case_insensitive(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        other = next(p.id for p in room_with_two.players if p.id != drawer)
        word = room_with_two.select_word(drawer, 0)

        score = room_with_two.submit_guess(other, word.upper())
        assert score == 30

    def test_trim_whitespace(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        other = next(p.id for p in room_with_two.players if p.id != drawer)
        word = room_with_two.select_word(drawer, 0)

        score = room_with_two.submit_guess(other, f"  {word}  ")
        assert score == 30


class TestTimer:
    def test_ticks_down(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        room_with_two.select_word(drawer, 0)

        assert room_with_two.seconds_left == DRAW_SECS
        secs = room_with_two.tick_timer()
        assert secs == DRAW_SECS - 1

    def test_returns_none_when_zero(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        room_with_two.select_word(drawer, 0)
        room_with_two.seconds_left = 0

        assert room_with_two.tick_timer() is None

    def test_returns_none_when_not_drawing(self, room: Room):
        assert room.tick_timer() is None


class TestAllGuessed:
    def test_true_when_all_guessed(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        other = next(p.id for p in room_with_two.players if p.id != drawer)
        word = room_with_two.select_word(drawer, 0)
        room_with_two.submit_guess(other, word)

        assert room_with_two.all_guessed()

    def test_false_when_not_all_guessed(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        room_with_two.select_word(drawer, 0)

        assert not room_with_two.all_guessed()


class TestEndRound:
    def test_transitions_to_round_result(self, room_with_two: Room):
        room_with_two.start_game()
        drawer = room_with_two.current_drawer_id
        other = next(p.id for p in room_with_two.players if p.id != drawer)
        word = room_with_two.select_word(drawer, 0)
        room_with_two.submit_guess(other, word)

        answer, scores = room_with_two.end_round()
        assert answer == word
        assert room_with_two.phase == GamePhase.ROUND_RESULT
        assert len(scores) == 1
        assert scores[0].player_id == other


class TestAdvanceRound:
    def test_advances_to_new_round_when_more_drawers(self, room_with_three: Room):
        room_with_three.start_game()
        first_drawer = room_with_three.current_drawer_id
        room_with_three.select_word(first_drawer, 0)
        room_with_three.end_round()

        new_phase = room_with_three.advance_round()
        assert new_phase == GamePhase.NEW_ROUND
        assert room_with_three.current_round == 2
        assert room_with_three.current_drawer_id != first_drawer

    def test_game_over_when_all_have_drawn(self, room_with_two: Room):
        # Round 1: first player draws
        room_with_two.start_game()
        first_drawer = room_with_two.current_drawer_id
        room_with_two.select_word(first_drawer, 0)
        room_with_two.end_round()

        # After round 1, still one player to draw
        new_phase = room_with_two.advance_round()
        assert new_phase == GamePhase.NEW_ROUND  # player 2 hasn't drawn yet

        # Round 2: second player draws
        second_drawer = room_with_two.current_drawer_id
        assert second_drawer != first_drawer
        room_with_two.select_word(second_drawer, 0)
        room_with_two.end_round()

        # After round 2, all have drawn → game over
        new_phase = room_with_two.advance_round()
        assert new_phase == GamePhase.GAME_OVER
        assert room_with_two.phase == GamePhase.GAME_OVER
        assert len(room_with_two.rankings) == 2
